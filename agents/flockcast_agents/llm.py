"""
JSON chat calls against any OpenAI-compatible endpoint. The Node server resolves which provider,
model and key to use and passes them in the environment; this module only makes the calls.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

LOCAL = {"localhost", "127.0.0.1", "::1"}


class LlmError(Exception):
    pass


def check_base_url(raw: str) -> str:
    """Model URLs must be https, or plain http on this machine (Ollama). Nothing else is fetched."""
    try:
        url = urllib.parse.urlsplit(raw)
    except ValueError:
        raise LlmError(f'The model base URL "{raw}" is not a URL.') from None
    host = (url.hostname or "").strip("[]")
    if not url.scheme or not host:
        raise LlmError(f'The model base URL "{raw}" is not a URL.')
    if url.scheme != "https" and not (url.scheme == "http" and host in LOCAL):
        raise LlmError("The model base URL must use https (plain http is allowed only on localhost).")
    if url.username or url.password:
        raise LlmError("Put the API key in the key setting, not in the URL.")
    return raw.rstrip("/")


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class Llm:
    """One model. `calls` counts every request, retries included."""

    def __init__(self, api_key: str, base_url: str, model: str, provider: str = "custom", user_agent: str = "flockcast-agents/1.1", timeout: float = 120, retries: int = 4, sleep=time.sleep):
        self.api_key = api_key
        self.base_url = check_base_url(base_url)
        self.model = model
        self.provider = provider
        self.user_agent = user_agent
        self.timeout = timeout
        self.retries = retries
        self.calls = 0
        self._sleep = sleep

    @classmethod
    def from_env(cls, env=None):
        """Null when the server gave no model, which means the labelled offline mode."""
        env = os.environ if env is None else env
        key, url, model = env.get("FLOCKCAST_LLM_API_KEY"), env.get("FLOCKCAST_LLM_BASE_URL"), env.get("FLOCKCAST_LLM_MODEL")
        if not (key and url and model):
            return None
        return cls(key, url, model, provider=env.get("FLOCKCAST_LLM_PROVIDER", "custom"), user_agent=env.get("FLOCKCAST_USER_AGENT", "flockcast-agents/1.1"))

    def _send(self, messages, temperature: float, max_tokens: int) -> str:
        body = json.dumps({"model": self.model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens, "response_format": {"type": "json_object"}}).encode()
        host = urllib.parse.urlsplit(self.base_url).netloc
        attempt = 0
        while True:
            self.calls += 1
            req = urllib.request.Request(f"{self.base_url}/chat/completions", data=body, method="POST")
            req.add_header("content-type", "application/json")
            req.add_header("accept", "application/json")
            # an explicit agent: some hosts block the default Python-urllib one
            req.add_header("user-agent", self.user_agent)
            req.add_header("authorization", f"Bearer {self.api_key}")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    status, headers, raw = res.status, res.headers, res.read()
            except urllib.error.HTTPError as e:
                status, headers, raw = e.code, e.headers, e.read()
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                if attempt < self.retries:
                    self._sleep(2 ** attempt)
                    attempt += 1
                    continue
                reason = getattr(e, "reason", e)
                raise LlmError(f"Could not reach the model at {host} ({reason}).") from None
            # free tiers rate-limit per minute: wait it out rather than failing the run
            if (status == 429 or status >= 500) and attempt < self.retries:
                try:
                    after = float(headers.get("retry-after") or "")
                except ValueError:
                    after = 0
                self._sleep(min(after, 60) if after > 0 else 2 * 2 ** attempt)
                attempt += 1
                continue
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = None
            if status >= 400:
                msg = ""
                if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict) and parsed["error"].get("message"):
                    msg = f": {str(parsed['error']['message'])[:200]}"
                raise LlmError(f"The model refused the call (HTTP {status}{msg}).")
            try:
                text = parsed["choices"][0]["message"]["content"]
            except (TypeError, KeyError, IndexError):
                text = None
            if not isinstance(text, str):
                raise LlmError("The model returned no text.")
            return text

    def json(self, system: str, user: str, validate=lambda x: x, temperature: float = 0.8, max_tokens: int = 4096):
        """One prompt, parsed as JSON and checked by validate(); a bad shape gets one retry with the error."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        for shape_try in range(2):
            text = self._send(messages, temperature, max_tokens)
            try:
                return validate(json.loads(_FENCE.sub("", text)))
            except Exception as e:  # noqa: BLE001 - any validation failure gets the retry
                if shape_try:
                    raise LlmError(f"The model returned an unusable answer: {e}") from None
                messages += [{"role": "assistant", "content": text}, {"role": "user", "content": f"That was invalid ({e}). Reply again with valid JSON only."}]
