"""The editing crew: platform checks, the AI-sounding check, fixes, the tough crowd and the quick read."""
import json
import unittest
from pathlib import Path

from flockcast_agents.studio.editor import candidates, fixes
from flockcast_agents.studio.norms import platform_checks
from flockcast_agents.studio.quick import quick_read
from flockcast_agents.studio.replies import pick
from flockcast_agents.studio.slop import ai_check
from flockcast_agents.swarm.engine import crowd_mood, rehearse
from flockcast_agents.swarm.personas import tough_crowd
from flockcast_agents.summarize import summarize

PLATFORMS = json.loads((Path(__file__).parent / "fixtures" / "platforms.json").read_text())
POST = "Most founders waste forty percent of their week on email. In today's fast-paced world, inbox zero is a game-changer. Here is what I do instead."


class Scripted:
    """A stand-in model that answers each call from a list and records the prompts."""

    model = "scripted"

    def __init__(self, *answers):
        self.answers = list(answers)
        self.prompts = []
        self.calls = 0

    def json(self, system, user, validate=lambda x: x, **kw):
        self.calls += 1
        self.prompts.append(system + "\n" + user)
        return validate(self.answers.pop(0))


class NormsTest(unittest.TestCase):
    def ids(self, text, platform):
        return [c["id"] for c in platform_checks([text] if isinstance(text, str) else text, PLATFORMS[platform])]

    def test_limits_links_hashtags_and_bait(self):
        self.assertIn("length", self.ids("x" * 281, "x"))
        self.assertNotIn("length", self.ids("x" * 281, "linkedin"))
        self.assertEqual(self.ids(["short", "y" * 300], "x"), ["length"])
        self.assertIn("link", self.ids("Read it at https://example.com", "linkedin"))
        self.assertIn("hashtags", self.ids("Hi #a #b #c", "x"))
        self.assertIn("bait", self.ids('Comment "YES" below if you want the guide.', "linkedin"))
        self.assertIn("promo", self.ids("Check out my new app, link in comments", "reddit"))
        self.assertEqual(self.ids("A calm, plain post about mornings.", "x"), [])

    def test_linkedin_fold_shows_what_readers_see(self):
        fold = next(c for c in platform_checks(["word " * 80], PLATFORMS["linkedin"]) if c["id"] == "fold")
        self.assertTrue(fold["excerpt"].endswith("…") and len(fold["excerpt"]) <= 212)


class SlopTest(unittest.TestCase):
    def test_rules_flag_stock_phrases_only(self):
        a = ai_check(None, [POST], PLATFORMS["x"])
        self.assertEqual(a["method"], "rules")
        self.assertEqual([f["index"] for f in a["flags"]], [1])
        self.assertEqual(a["score"], 33)

    def test_model_flags_must_point_at_real_sentences(self):
        llm = Scripted({"flags": [{"sentence": 3, "why": "Vague promise."}, {"sentence": 9, "why": "no such sentence"}, {"sentence": 1, "why": ""}]})
        a = ai_check(llm, [POST], PLATFORMS["linkedin"])
        self.assertEqual(a["method"], "model")
        self.assertEqual([(f["index"], f["by"]) for f in a["flags"]], [(1, "rules"), (2, "model")])


class EditorTest(unittest.TestCase):
    def summary(self):
        posts = [{"post_id": 1, "user_id": 0, "original_post_id": None, "content": POST}]
        reply = lambda i, name, t: {"round_num": 1, "agent_id": i, "agent_name": name, "action_type": "REPLY", "action_args": {"post_id": 1, "content": t}}  # noqa: E731
        sentences = [{"id": None, "text": s} for s in ["Most founders waste forty percent of their week on email.", "In today's fast-paced world, inbox zero is a game-changer.", "Here is what I do instead."]]
        return summarize(POST, sentences, posts, [reply(1, "Sam", "Where is the forty percent from? Source?"), reply(2, "Ana", "Forty percent of the week on email? Says who?"), reply(3, "Lee", "Love this, trying it.")])

    def test_offline_fixes_explain_and_name_who_objected(self):
        s = self.summary()
        f = fixes(None, s, ai_check(None, [POST], PLATFORMS["x"]), PLATFORMS["x"], "@kai")
        self.assertEqual(f[0]["sentence"], "Most founders waste forty percent of their week on email.")
        self.assertEqual(f[0]["who"], ["Sam", "Ana"])
        self.assertIn("2 simulated readers", f[0]["why"])
        self.assertIsNone(f[0]["rewrite"])
        self.assertIn("reads as AI", f[1]["why"])

    def test_model_rewrites_are_kept_only_when_they_change_the_sentence(self):
        s = self.summary()
        cands = candidates(s, [])
        llm = Scripted({"fixes": [{"sentence": 1, "why": "No source for the number.", "rewrite": "In my own tracking, email took about [source] of my week."}, {"sentence": 5, "rewrite": "x"}]})
        f = fixes(llm, s, {"flags": []}, PLATFORMS["x"], "@kai")
        self.assertEqual(len(cands), 1)
        self.assertEqual(f[0]["why"], "No source for the number.")
        self.assertIn("[source]", f[0]["rewrite"])
        self.assertIn("Never invent facts", llm.prompts[0])

    def test_reply_prep_answers_pushback_first_one_per_person(self):
        chosen = pick(self.summary()["replies"])
        self.assertEqual([r["agent_name"] for r in chosen], ["Sam", "Ana", "Lee"])


class CrowdTest(unittest.TestCase):
    def test_tough_crowd_has_a_critic_and_a_quarter_skeptics(self):
        base = [{"id": i + 1, "name": f"P{i}", "segment": "s", "bio": "b", "interests": [], "stance": "neutral" if i % 2 else "supportive", "activity": 0.5, "follows_author": True} for i in range(11)]
        crowd = tough_crowd(base, 12)
        self.assertEqual(len(crowd), 12)
        self.assertEqual(crowd[-1]["name"], "Rook (harsh critic)")
        self.assertEqual(crowd[-1]["id"], 12)
        self.assertGreaterEqual(sum(1 for p in crowd if p["stance"] == "skeptical"), 3)

    def test_a_crowd_that_loves_everything_gets_a_warning(self):
        s = {"counts": {"likes": 9, "reposts": 3, "quotes": 0, "replies": 1}, "replies": [{"stance": "other"}], "pushback_share": 0}
        self.assertIn("best case", crowd_mood(s, [])["warning"])
        s["pushback_share"] = 0.3
        self.assertIsNone(crowd_mood(s, [])["warning"])

    def test_offline_studio_run_has_checks_fixes_and_a_critic(self):
        payload = {"input": {"posts": [POST]}, "settings": {"rounds": 4, "personas": 8, "audience": None, "handle": "kai", "platform": "linkedin", "critic": True, "studio": True}, "platform": PLATFORMS["linkedin"]}
        x = rehearse(None, payload, lambda s, p: None)["result"]
        self.assertEqual(x["mode"], "crowd")
        self.assertEqual(x["critic"], 8)
        self.assertEqual(x["personas"][-1]["segment"], "Harsh critic")
        self.assertEqual(x["ai_check"]["method"], "rules")
        self.assertIsInstance(x["fixes"], list)
        self.assertEqual(x["reply_prep"], [], "answers need a model")
        self.assertIn("crowd", x)
        self.assertNotIn("studio_errors", x)

    def test_a_reused_cast_gives_every_draft_the_same_people_and_luck(self):
        settings = {"rounds": 4, "personas": 8, "audience": None, "handle": "kai", "platform": "x", "critic": True, "studio": True}
        first = rehearse(None, {"input": {"posts": [POST]}, "settings": settings, "platform": PLATFORMS["x"]}, lambda s, p: None)
        cast = first["state"]["personas"]
        a = rehearse(None, {"input": {"posts": ["Version A. Read drafts backwards."], "cast": cast}, "settings": settings, "platform": PLATFORMS["x"]}, lambda s, p: None)["result"]
        b = rehearse(None, {"input": {"posts": ["Version B. 40% of readers skip lines."], "cast": cast}, "settings": settings, "platform": PLATFORMS["x"]}, lambda s, p: None)["result"]
        self.assertEqual([p["name"] for p in a["personas"]], [p["name"] for p in cast])
        self.assertEqual(a["personas"], b["personas"])
        self.assertEqual(a["critic"], 8)

    def test_a_broken_cast_is_refused(self):
        from flockcast_agents.swarm.engine import JobError
        bad = {"input": {"posts": [POST], "cast": [{"name": "Only one"}]}, "settings": {"rounds": 2, "personas": 4, "audience": None, "handle": "kai", "platform": "x"}, "platform": PLATFORMS["x"]}
        with self.assertRaises(JobError) as e:
            rehearse(None, bad, lambda s, p: None)
        self.assertEqual(e.exception.status, 400)


class QuickTest(unittest.TestCase):
    def test_one_call_builds_a_feed_the_summary_can_read(self):
        llm = Scripted({"readers": [
            {"name": "Sam", "segment": "Skeptics", "bio": "Asks for sources.", "stance": "skeptical", "reaction": "reply", "text": "Forty percent? Source?"},
            {"name": "Ana", "segment": "Peers", "bio": "Writer.", "stance": "supportive", "reaction": "like"},
            {"name": "Lee", "segment": "New", "bio": "New here.", "stance": "neutral", "reaction": "reply", "text": ""},
            {"name": "Max", "segment": "Peers", "bio": "Founder.", "stance": "neutral", "reaction": "nothing"},
        ]})
        settings = {"personas": 4, "handle": "kai"}
        personas, posts, actions, memory = quick_read(llm, POST, settings, PLATFORMS["x"], "Peers\nSkeptics", True)
        s = summarize(POST, None, posts, actions, 1)
        self.assertEqual(llm.calls, 1)
        self.assertIn("harsh critic", llm.prompts[0])
        self.assertEqual(s["counts"]["replies"], 1)
        self.assertEqual(s["counts"]["likes"], 2, "a reply with no text becomes a like")
        self.assertEqual(memory[4], ["read the post and scrolled on"])
        self.assertEqual([p["id"] for p in personas], [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
