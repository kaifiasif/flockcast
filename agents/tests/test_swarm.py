"""The rehearsal crowd: same numbers as the TypeScript engine it replaced, feed rules, offline report."""
import json
import unittest
from pathlib import Path

from flockcast_agents.swarm.engine import JobError, draft_of, interview, rehearse
from flockcast_agents.swarm.simulate import World, apply, feed_for, rng_from, seed_draft

FIXTURES = Path(__file__).parent / "fixtures"
PLATFORMS = json.loads((FIXTURES / "platforms.json").read_text())
POST = "Fluent sentences are the dangerous ones. Reviewers skim them and forty percent of errors hide there."


def run_offline(posts, platform="x", personas=6, rounds=3, audience=None):
    stages = []
    payload = {"input": {"posts": posts}, "settings": {"rounds": rounds, "personas": personas, "audience": audience, "handle": "kai", "platform": platform}, "platform": PLATFORMS[platform]}
    out = rehearse(None, payload, lambda s, p: stages.append([s, p]))
    return out, stages


class RandomTest(unittest.TestCase):
    def test_matches_the_javascript_generator(self):
        # values from the old TypeScript rngFrom (FNV-1a seed, mulberry32), emoji included
        r = rng_from("Café 🚀|x|6")
        self.assertEqual([r(), r(), r()], [0.1556382596027106, 0.8625833110418171, 0.28970670187845826])


class GoldenTest(unittest.TestCase):
    def test_offline_runs_match_the_typescript_engine(self):
        for g in json.loads((FIXTURES / "offline_rehearsals.json").read_text()):
            c = g["case"]
            with self.subTest(posts=c["posts"][0][:30]):
                out, stages = run_offline(c["posts"], c["platform"], c["personas"], c["rounds"], c["audience"])
                self.assertEqual(out["result"], g["result"])
                self.assertEqual(stages, g["stages"])
                if not any(ord(ch) > 0xFFFF for ch in "".join(c["posts"])):
                    # JavaScript cut notes in UTF-16 units and could split an emoji; Python never does
                    self.assertEqual(out["state"]["memory"], g["memory"])


class FeedTest(unittest.TestCase):
    def test_non_followers_only_see_the_post_once_it_spreads(self):
        personas = [
            {"id": 1, "name": "F", "segment": "s", "bio": "b", "interests": [], "stance": "neutral", "activity": 1, "follows_author": True},
            {"id": 2, "name": "N", "segment": "s", "bio": "b", "interests": [], "stance": "neutral", "activity": 1, "follows_author": False},
        ]
        world = World("me", POST, personas, PLATFORMS["x"])
        post = seed_draft(world)
        follower, stranger = world.agents[1], world.agents[2]
        self.assertEqual(len(feed_for(world, follower)), 1)
        self.assertEqual(len(feed_for(world, stranger)), 0)
        self.assertTrue(apply(world, follower, {"agent_id": 1, "action": "repost", "post_id": post["post_id"]}, [post]))
        self.assertEqual(len(feed_for(world, stranger)), 1)
        self.assertFalse(apply(world, follower, {"agent_id": 1, "action": "repost", "post_id": post["post_id"]}, [post]), "no double reposts")

    def test_model_actions_outside_the_feed_or_without_text_are_dropped(self):
        world = World("me", POST, [], PLATFORMS["x"])
        post = seed_draft(world)
        agent = {"id": 1, "name": "A", "segment": "s", "bio": "b", "interests": [], "stance": "neutral", "activity": 1, "follows_author": True}
        self.assertFalse(apply(world, agent, {"action": "like", "post_id": 99}, [post]))
        self.assertFalse(apply(world, agent, {"action": "reply", "post_id": 1, "text": "   "}, [post]))
        self.assertFalse(apply(world, agent, {"action": "explode", "post_id": 1}, [post]))
        self.assertTrue(apply(world, agent, {"action": "reply", "post_id": "1", "text": "x" * 999}, [post]))
        self.assertEqual(len(world.posts[-1]["content"]), PLATFORMS["x"]["replyChars"])


class EngineTest(unittest.TestCase):
    def test_offline_run_is_labelled_and_seeds_the_draft(self):
        out, stages = run_offline([POST], personas=10, rounds=5)
        x = out["result"]
        self.assertEqual(x["engine"], "swarm-offline")
        self.assertIsNone(x["model"])
        self.assertTrue(x["draft_seeded"])
        self.assertIn("Offline estimate", x["report"]["markdown"])
        self.assertEqual(stages[0], ["preparing", 5])
        self.assertEqual(stages[-1], ["reporting", 88])
        forty = next(s for s in x["sentences"] if "forty percent" in s["text"])
        self.assertGreaterEqual(forty["pushback"], 1)

    def test_threads_are_numbered(self):
        self.assertEqual(draft_of(["a", "b"]), "1/2 a\n\n2/2 b")
        self.assertEqual(draft_of(["solo"]), "solo")

    def test_empty_posts_and_offline_interviews_are_refused(self):
        with self.assertRaises(JobError) as e:
            run_offline(["  "])
        self.assertEqual(e.exception.status, 400)
        with self.assertRaises(JobError) as e:
            interview(None, {"state": {}, "agent_id": 1, "question": "?", "platform": PLATFORMS["x"]})
        self.assertEqual(e.exception.status, 409)


if __name__ == "__main__":
    unittest.main()
