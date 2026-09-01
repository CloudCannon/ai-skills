---
name: <verb-first-name>
description: >-
  <One or two sentences an agent matches against the user's request. Name the
  concrete things the user would say — the symptom in their words, the file
  names, the CloudCannon feature. Then state what the skill does. End with what
  it is NOT for, so it does not fire on adjacent requests.>
---

# <Skill title>

<One or two sentences: what this does, and the state the site is expected to be in already.>

## When to use

- <A concrete trigger, in the user's words rather than yours>
- <Another>
- <Another>

## When not to use

- **<Adjacent case>** — that is [`<other-skill>`](../<other-skill>/SKILL.md). <One line on where the boundary falls.>
- **<A precondition that is not met>** — <what has to happen first, and which skill does it>

## Contents

| File                                     | Covers          |
| ---------------------------------------- | --------------- |
| **SKILL.md** (this file)                 | <routing only>  |
| [<deep-dive>.md](<deep-dive>.md)         | <what is in it> |
| [troubleshooting.md](troubleshooting.md) | Symptom → fix   |

## Prerequisites

- <What must already be true. An operation runs against a working site — say what "working" means here.>

## Workflow

1. **<Verb>** — <one step per bullet, imperative>
2. **<Verb>** — <…>

## Checklist

- [ ] <One check per line, verifiable>
- [ ] <…>

## Common mistakes

| Excuse     | Reality        |
| ---------- | -------------- |
| "<excuse>" | <what is true> |
