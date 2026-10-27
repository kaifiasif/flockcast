"""Studies: focus groups, message tests, crisis rehearsals and the brand rules check."""
import unittest

from flockcast_agents.research.brand import brand_check, rule_issues
from flockcast_agents.research.crisis import guard_facts, run_crisis, statement_checks
from flockcast_agents.research.focus_group import run_focus_group
from flockcast_agents.research.message_test import run_message_test, scoreboard
from flockcast_agents.research.panel import segments_of, validate_panel
from flockcast_agents.research.study import run_study

from .test_studio import Scripted

SEGMENTS = [{"name": "Founders", "about": "run small startups"}, {"name": "Comms leads", "about": "approve brand posts"}]
quiet = lambda *a: None  # noqa: E731


def people_answer(per=2):
    return {"people": [{"name": f"{s['name'][0]}{i}", "segment": s["name"], "bio": "x", "stance": "skeptical" if i else "supportive"} for s in SEGMENTS for i in range(per)]}


class PanelTest(unittest.TestCase):
    def test_groups_are_cleaned_and_deduplicated(self):
        self.assertEqual([s["name"] for s in segments_of([{"name": " A "}, {"name": "a"}, "B", 3])], ["A", "B"])
        with self.assertRaises(ValueError):
            segments_of([])

    def test_model_people_must_belong_to_a_named_group(self):
        o = people_answer()
        o["people"].append({"name": "Stray", "segment": "Nobody", "bio": "", "stance": "odd"})
        panel = validate_panel(o, segments_of(SEGMENTS), 2)
        self.assertEqual([p["id"] for p in panel], [1, 2, 3, 4])
        self.assertNotIn("Stray", [p["name"] for p in panel])
        with self.assertRaises(ValueError):
            validate_panel({"people": o["people"][:2]}, segments_of(SEGMENTS), 2)


class FocusGroupTest(unittest.TestCase):
    INPUT = {"topic": "Launch", "material": "We cut onboarding time by 80%. Sign up today.", "questions": ["First reaction?"], "segments": SEGMENTS, "panelists": 4}

    def test_offline_is_labelled_by_stance_and_flags_the_unbacked_claim(self):
        r = run_study(None, {"kind": "focus_group", "input": self.INPUT}, quiet)
        self.assertEqual(r["engine"], "swarm-offline")
        self.assertEqual(len(r["transcript"][0]["answers"]), 4)
        self.assertEqual(r["summary"]["themes"][0]["title"], "Claims need backing")

    def test_with_a_model_answers_are_checked_and_summarised(self):
        llm = Scripted(
            people_answer(),
            {"answers": [{"person": 1, "text": "Love it", "sentiment": "positive"}, {"person": 2, "text": "Where is 80% from?", "sentiment": "negative"}, {"person": 3, "text": "Fine", "sentiment": "odd"}, {"person": 99, "text": "ghost"}]},
            {"themes": [{"title": "Proof", "detail": "They want the source.", "people": [2, 99]}], "by_segment": [{"segment": "founders", "takeaway": "Split"}, {"segment": "Nobody", "takeaway": "x"}]},
        )
        r = run_focus_group(llm, self.INPUT, quiet)
        answers = r["transcript"][0]["answers"]
        self.assertEqual([a["person"] for a in answers], [1, 2, 3])
        self.assertEqual(answers[2]["sentiment"], "mixed")
        self.assertEqual(r["summary"]["themes"][0]["people"], [2])
        self.assertEqual(r["summary"]["by_segment"], [{"segment": "Founders", "takeaway": "Split"}])
        self.assertEqual(llm.calls, 3)


class MessageTestTest(unittest.TestCase):
    MESSAGES = [{"text": "The best tool ever. 9 in 10 agree."}, {"text": "Try your next post on a simulated crowd before you publish."}]

    def test_offline_prefers_the_clear_sourced_message_and_runs_brand_rules(self):
        r = run_message_test(None, {"messages": self.MESSAGES, "segments": SEGMENTS, "per_segment": 3}, {"banned": ["best"]}, quiet)
        self.assertEqual(r["winner"], 1)
        self.assertEqual(len(r["matrix"]), 2)
        self.assertEqual(r["messages"][0]["brand"][0]["level"], "risk")
        self.assertEqual(r["messages"][1]["brand"], [])

    def test_groups_count_equally_and_a_split_is_flagged(self):
        panel = [{"id": 1, "segment": "A"}, {"id": 2, "segment": "B"}, {"id": 3, "segment": "B"}]
        rate = lambda p, m, v: {"person": p, "message": m, "appeal": v, "clarity": v, "credibility": v, "act": v == 5, "says": "ok"}  # noqa: E731
        board = scoreboard(self.MESSAGES, panel, [rate(1, 0, 5), rate(1, 1, 1), rate(2, 0, 1), rate(2, 1, 5), rate(3, 0, 1), rate(3, 1, 5)])
        self.assertTrue(board["split"])
        self.assertEqual([o["score"] for o in board["overall"]], [50, 50])
        self.assertEqual(board["matrix"][0]["winner"], 0)

    def test_model_ratings_are_clipped_and_need_half_the_panel(self):
        llm = Scripted(people_answer(1), {"ratings": [{"person": 1, "message": "A", "appeal": 9, "clarity": "x", "credibility": 2, "act": True, "says": "hm"}, {"person": 1, "message": "b", "appeal": 2}]}, {"ratings": [{"person": 2, "message": "A"}, {"person": 2, "message": "Z"}]})
        r = run_message_test(llm, {"messages": self.MESSAGES, "segments": SEGMENTS, "per_segment": 1}, None, quiet)
        first = r["ratings"][0]
        self.assertEqual((first["appeal"], first["clarity"]), (5, 3))
        self.assertEqual(len(r["ratings"]), 3)


class CrisisTest(unittest.TestCase):
    def test_checks_find_dodges_and_credit_ownership(self):
        bad = {c["id"]: c["level"] for c in statement_checks("Unfortunately an issue occurred with a third-party provider.")}
        self.assertEqual(bad["apology"], "risk")
        self.assertEqual(bad["deflect"], "risk")
        good = {c["id"]: c["level"] for c in statement_checks("We are sorry. We made a mistake in Monday's update. We will refund every failed payment by Friday. Updates at status.example.com.")}
        self.assertEqual({good[k] for k in ("apology", "ownership", "next", "contact")}, {"good"})
        self.assertNotIn("deflect", good)

    def test_a_revised_statement_cannot_invent_numbers(self):
        self.assertEqual(guard_facts("Down 6 hours, 4,000 users, fixed by 9:00.", ["It was down 6 hours."]), "Down 6 hours, [fact] users, fixed by [fact]")

    def test_worst_line_must_be_quoted_from_the_statement(self):
        llm = Scripted(
            {"reactions": [{"group": "press", "heat": "4.6", "reaction": "Dodgy", "worst_line": "third-party provider", "question": "Who?"}, {"group": "customers", "heat": 2, "reaction": "Meh", "worst_line": "We never said this"}]},
            {"spread": "high", "headlines": ["App blames vendor"], "follow_ups": []},
            {"changes": ["Apologise"], "revised": "We are sorry for the 12 hour outage."},
        )
        r = run_crisis(llm, {"situation": "Outage on Monday.", "statement": "An issue with a third-party provider.", "stakeholders": ["press", "customers", "aliens"]}, quiet)
        self.assertEqual([x["group"] for x in r["reactions"]], ["press", "customers"])
        self.assertEqual(r["reactions"][0]["heat"], 5)
        self.assertIsNone(r["reactions"][1]["worst_line"])
        self.assertEqual(r["risk"]["level"], "high")
        self.assertEqual(r["advice"]["revised"], "We are sorry for the [fact] hour outage.")

    def test_offline_still_rates_the_risk(self):
        r = run_crisis(None, {"situation": "Outage.", "statement": "Mistakes were made.", "stakeholders": ["critics"]}, quiet)
        self.assertEqual(r["reactions"][0]["heat"], 5)
        self.assertIsNone(r["advice"]["revised"])


class BrandTest(unittest.TestCase):
    def test_banned_words_match_whole_words_only(self):
        self.assertEqual(rule_issues("We are the bestest.", {"banned": ["best"]}), [])
        self.assertEqual(len(rule_issues("Simply the best!", {"banned": ["best"], "required": []})), 1)

    def test_voice_issues_point_at_real_sentences(self):
        llm = Scripted({"fits": False, "why": "Too loud", "issues": [{"sentence": 2, "why": "Shouting"}, {"sentence": 9, "why": "ghost"}]})
        r = brand_check(llm, "Hello there. BUY NOW!!!", {"voice": "Calm and plain"})
        self.assertFalse(r["ok"])
        self.assertEqual([i["excerpt"] for i in r["issues"]], ["BUY NOW!!!"])
        self.assertIsNone(brand_check(llm, "x", {"banned": []}))


if __name__ == "__main__":
    unittest.main()
