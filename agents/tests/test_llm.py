"""Model calls: retries on rate limits, one retry on a bad shape, URL rules, and the job runner."""
import json
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from flockcast_agents.jsnum import to_fixed
from flockcast_agents.llm import Llm, LlmError, check_base_url
from flockcast_agents.text import stance_of

AGENTS = Path(__file__).resolve().parents[1]


def serve(replies):
    """A one-thread model server answering from a list: (status, body) per call."""
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            calls.append({"path": self.path, "ua": self.headers.get("user-agent"), "auth": self.headers.get("authorization"), "body": json.loads(self.rfile.read(int(self.headers["content-length"])))})
            status, content = replies[min(len(calls), len(replies)) - 1]
            body = json.dumps({"choices": [{"message": {"content": content}}]}) if content is not None else "{}"
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("retry-after", "0")
            self.end_headers()
            self.wfile.write(body.encode())

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, calls


class LlmTest(unittest.TestCase):
    def test_retries_429_then_a_bad_shape_once_and_counts_every_call(self):
        server, calls = serve([(429, None), (200, "not json"), (200, '```json\n{"ok": 1}\n```')])
        try:
            llm = Llm("k", f"http://127.0.0.1:{server.server_port}/v1", "m", user_agent="flockcast-test", sleep=lambda s: None)
            self.assertEqual(llm.json("sys", "user", validate=lambda o: o["ok"]), 1)
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(llm.calls, 3)
        self.assertEqual(calls[0]["path"], "/v1/chat/completions")
        self.assertEqual(calls[0]["ua"], "flockcast-test")
        self.assertEqual(calls[0]["auth"], "Bearer k")
        self.assertEqual(calls[0]["body"]["response_format"], {"type": "json_object"})
        self.assertIn("That was invalid", calls[2]["body"]["messages"][-1]["content"])

    def test_refusals_say_what_happened(self):
        server, _ = serve([(401, None)])
        try:
            with self.assertRaisesRegex(LlmError, "HTTP 401"):
                Llm("k", f"http://127.0.0.1:{server.server_port}/v1", "m", sleep=lambda s: None).json("s", "u")
        finally:
            server.shutdown()
            server.server_close()

    def test_url_rules(self):
        with self.assertRaisesRegex(LlmError, "https"):
            check_base_url("http://example.com/v1")
        with self.assertRaisesRegex(LlmError, "key setting"):
            check_base_url("https://user:pw@example.com/v1")
        self.assertEqual(check_base_url("http://localhost:11434/v1/"), "http://localhost:11434/v1")
        self.assertIsNone(Llm.from_env({}))


class HelpersTest(unittest.TestCase):
    def test_to_fixed_rounds_ties_like_javascript(self):
        self.assertEqual(to_fixed(0.125, 2), 0.13)
        self.assertEqual(to_fixed(1 / 3, 2), 0.33)

    def test_pushback_cue(self):
        self.assertEqual(stance_of("Where is the 40% from? I would want the study first."), "pushback")
        self.assertEqual(stance_of("Reading backwards is a great trick."), "other")


class RunnerTest(unittest.TestCase):
    def run_job(self, job, payload):
        env = {"PYTHONPATH": str(AGENTS), "PYTHONDONTWRITEBYTECODE": "1"}
        out = subprocess.run([sys.executable, "-m", "flockcast_agents", job], input=json.dumps(payload), capture_output=True, text=True, env=env, timeout=60)
        return [json.loads(line) for line in out.stdout.splitlines()]

    def test_jobs_stream_stages_then_one_result(self):
        lines = self.run_job("advise", {"input": {"product": "P", "pitch": "A thing that does things.", "audience": None, "price_idea": None, "competitors": [], "billing": "subscription", "currency": "USD", "buyers": 5}, "sources": ["sample"]})
        self.assertEqual([l["type"] for l in lines], ["stage", "stage", "result"])
        self.assertEqual(lines[-1]["result"]["mode"], "offline")

    def test_errors_are_one_clean_line(self):
        lines = self.run_job("interview", {"state": {}, "agent_id": 1, "question": "?", "platform": {}})
        self.assertEqual(lines, [{"type": "error", "message": "Interviews need a model key.", "status": 409}])
        bad = self.run_job("advise", {"input": {}, "sources": ["twitter"]})
        self.assertEqual(bad[-1]["type"], "error")
        self.assertEqual(bad[-1]["status"], 400)


if __name__ == "__main__":
    unittest.main()
