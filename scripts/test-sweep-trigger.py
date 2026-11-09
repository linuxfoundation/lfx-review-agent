# Copyright The Linux Foundation and each contributor to LFX.
# SPDX-License-Identifier: MIT
import json
import os
from pathlib import Path
import subprocess
import tempfile

native = "linux-foundation~lfx-review-agent"
controller = "linux-foundation~lfx-review-controller"
def trigger(repo, agent=native, **overrides):
    return {"type": "webhook", "deactivated_at": None, "event_type": "pull_request",
            "action": "synchronize", "agent": {"full_name": agent},
            "service_config": {"repo": "linuxfoundation/" + repo}, **overrides}

items = [trigger("existing"), trigger("pilot", controller), trigger("both"),
         trigger("both", controller), trigger("inactive", deactivated_at="2026-11-04"),
         trigger("other", "linux-foundation~other"), trigger("opened", action="opened"),
         trigger("issue", event_type="issues"), trigger("time", type="time"),
         trigger("outside", service_config={"repo": "other/repo"})]
with tempfile.TemporaryDirectory() as directory:
    tmp = Path(directory)
    (tmp / "fixture").write_text(json.dumps({"items": items, "pagination": {"has_more": False}}))
    (tmp / "guild").write_text('#!/bin/sh\nif [ "$4" = list ]; then cat "$SWEEP_FIXTURE"; else printf "%s\\0" "$@" > "$SWEEP_CALLS"; fi\n')
    (tmp / "guild").chmod(0o755)
    env = {**os.environ, "PATH": str(tmp) + os.pathsep + os.environ["PATH"],
           "WS": "offline",
           "SWEEP_FIXTURE": str(tmp / "fixture"), "SWEEP_CALLS": str(tmp / "calls")}
    env.pop("REVIEW_AGENT", None)
    subprocess.run(["bash", str(Path(__file__).with_name("sweep-trigger.sh")), "--apply"], env=env, check=True)
    args = (tmp / "calls").read_bytes().decode().rstrip("\0").split("\0")
    assert args[:2] == ["trigger", "create"]
    assert args[args.index("--agent") + 1] == native
    assert json.loads(args[args.index("--input") + 1]) == {
        "lfx_review_agent_event": "sweep", "repos": ["linuxfoundation/both", "linuxfoundation/existing", "linuxfoundation/pilot"]}
    for selected in [controller, "linux-foundation~custom-controller"]:
        env["REVIEW_AGENT"] = selected
        subprocess.run(["bash", str(Path(__file__).with_name("sweep-trigger.sh")), "--apply"], env=env, check=True)
        assert (tmp / "calls").read_bytes().decode().rstrip("\0").split("\0") == args
    env.pop("REVIEW_AGENT")
    (tmp / "fixture").write_text(json.dumps({"items": [trigger("pilot", controller)], "pagination": {"has_more": False}}))
    subprocess.run(["bash", str(Path(__file__).with_name("sweep-trigger.sh")), "--apply"], env=env, check=True)
    args = (tmp / "calls").read_bytes().decode().rstrip("\0").split("\0")
    assert json.loads(args[args.index("--input") + 1])["repos"] == ["linuxfoundation/pilot"]
print("PASS: mixed rollout preserves the repository union and Native sweep target")
