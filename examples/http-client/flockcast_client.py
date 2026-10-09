"""
A Flockcast client for Python apps, standard library only. Same API as flockcast-client.ts.

    FLOCKCAST_URL=https://your-flockcast.example
    FLOCKCAST_KEY=flk_...

    from flockcast_client import Flockcast
    fc = Flockcast(os.environ["FLOCKCAST_URL"], os.environ["FLOCKCAST_KEY"])
    done = fc.wait(fc.rehearse("Your draft.", subject="draft-42")["id"])
    print(done["result"]["pushback_share"])

Call it from your server only: the key must never reach a browser.
"""
import json
import time
import urllib.error
import urllib.request


class FlockcastError(Exception):
    pass


class Flockcast:
    def __init__(self, url: str, key: str, timeout: float = 30):
        self.base = url.rstrip("/") + "/api/v1"
        self.key = key
        self.timeout = timeout

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.key}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            try:
                message = json.loads(e.read())["error"]["message"]
            except Exception:
                message = f"Flockcast answered {e.code}"
            raise FlockcastError(message) from None

    def project(self) -> dict:
        return self._call("GET", "/project")["project"]

    def rehearse(self, text: str, **opts) -> dict:
        """Starts (or returns the finished) rehearsal. opts: subject, title, platform, personas, rounds, audience, force."""
        return self._call("POST", "/rehearsals", {"text": text, **opts})["rehearsal"]

    def get(self, rehearsal_id: str) -> dict:
        return self._call("GET", f"/rehearsals/{rehearsal_id}")["rehearsal"]

    def ask(self, rehearsal_id: str, agent_id: int, prompt: str) -> dict:
        return self._call("POST", f"/rehearsals/{rehearsal_id}/interview", {"agent_id": agent_id, "prompt": prompt})["interview"]

    def advise(self, product: str, pitch: str, **opts) -> dict:
        """Starts a launch advisor run. opts: audience, price_idea, competitors, billing, currency, buyers."""
        return self._call("POST", "/advice", {"product": product, "pitch": pitch, **opts})["advice"]

    def get_advice(self, advice_id: str) -> dict:
        return self._call("GET", f"/advice/{advice_id}")["advice"]

    def wait(self, rehearsal_id: str, every: float = 2, timeout: float = 300) -> dict:
        return self._wait(lambda: self.get(rehearsal_id), every, timeout)

    def wait_advice(self, advice_id: str, every: float = 3, timeout: float = 600) -> dict:
        return self._wait(lambda: self.get_advice(advice_id), every, timeout)

    @staticmethod
    def _wait(read, every: float, timeout: float) -> dict:
        until = time.monotonic() + timeout
        while True:
            item = read()
            if item["status"] in ("done", "failed"):
                return item
            if time.monotonic() > until:
                raise FlockcastError("Still running. Check again later.")
            time.sleep(every)
