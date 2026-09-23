# A fan slot is an answerer, and the repo is something you hand it

A question-fan slot is an agent that answers a question. It is not a coding agent restrained from writing. It launches with no working directory unless the fan names one, with write tools removed rather than permissions withheld, with read tools and web search intact, and with project conventions but never the user's personal instruction file.

**Status:** superseded by ADR 0021

## Context

Read-only was implemented for claude as `--permission-mode plan`, for both the `NONE` and `DOCS` scopes. The reasoning was sound as far as it went: plan mode cannot write, so plan mode is read-only.

The first real run of the question fan against the harness showed what else it does. Asked "what are the most recent AI news", both claude workers answered:

> This isn't a planning task — you're in plan mode, which is for scoping code changes in the Cockpit repo.

Plan mode does not merely block writes. It tells the agent that its job this turn is to scope a change to the working directory, and the working directory was `app.getAppPath()` — this repo. The workers were not being difficult; they answered the question they were told they had been asked.

Two further symptoms, both visible in the architect's own comparison of that run: both workers concluded plan mode prevented a web search, which it does not, and one invented a reason for the mode being active. The framing did not add a caveat to an otherwise good answer. It produced a false belief about the agent's own capability, and that belief consumed the turn.

## What was actually wrong

The framing was downstream of a modelling error. A slot had been modelled as *a coding agent, restrained* — and if that is what a slot is, plan mode is the obvious safe setting. It is the wrong model. A question fan compares opinions on a question. The repository is incidental to most questions and actively misleading for the rest.

The correct model is an **answerer**: an agent whose entire situation is the question, plus whatever access the fan deliberately grants it.

The coding-agent model is not wrong everywhere. It is exactly right for the build fan in phase 2, which edits a repo in a worktree per slot. Keeping the two models distinct now prevents one scope concept from having to mean both.

## Decision

**The workspace belongs to the fan, not the slot.** One folder, or none, for the whole run. Per-slot workspaces would mean w1 could read the repo while w2 could not, and the architect would be grading answers that had different information — a confound, not a comparison. The workspace reaches every slot, criteria and architect included: an architect checking a worker's claim about the code needs the same access the worker had.

**The default is no workspace.** Research questions are the common case, and a fan with no folder cannot be distracted by one or leak from one.

**Read-only is enforced by removing the write tools by name**, not by relying on a permission prompt going unanswered in a non-interactive run. Enforcement that works only because nobody can approve the request is luck, not a rule, and a blocked write still costs the turn. This matches how codex is already launched — `--sandbox read-only`, a stated restriction.

**Read tools and web search stay.** A fan whose members cannot search cannot answer anything about the present; it compares four training cutoffs and calls the result a comparison. Search is read-only, and it is most of what makes four subscriptions worth spending.

**Slots read project conventions, each vendor its own file** — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`. These describe the codebase, so every worker having its own copy of the same rules is correct.

**Slots do not read the user's personal instruction file.** Today they do, and unevenly: this repo has `AGENTS.md` and no `CLAUDE.md`, so codex workers read real project conventions while claude workers fall back to `~/.claude/CLAUDE.md` — 11.2K of personal working preferences, lane rules and writing style. Two vendors running under different rulebooks that the plate never mentions is a confound underneath every comparison, and it compounded the plan-mode framing: a worker asked about the news had been told twice, in two different ways, that it was here to do repo work.

A personal instruction file describes how its author wants an assistant to work *with them*. A fan worker is not working with anyone; it answers one question in isolation so that four answers can be compared.

## Consequences

- The repo gains `CLAUDE.md` and `GEMINI.md`, so "each vendor reads its designated file" is true rather than aspirational. The repo `CLAUDE.md` stays short — pointers to `docs/tickets.md`, `docs/plans/`, `CONTEXT.md`, `docs/mockups/` — because every claude process launched here loads it, fan workers included. Per-agent orchestration guidance stays in the adapter files under `~/.claude/skills/agent-loop/agents/`, for the same reason: a worker told how to dispatch other agents answers like a dispatcher.
- The workspace persists with the arrangement and is always visible on the plate, including when empty. A persisted workspace that cannot be seen is the same failure as an inherited instruction file — context arriving invisibly and changing the answer.
- **Unverified at the time of writing:** whether the claude CLI can be made to skip the user-level file while still reading the project one. It is to be probed before the ticket is written, not assumed.

## Ruled out

- **Keeping plan mode and accepting the framing.** It does not merely colour the tone; it produced two factually wrong statements about capability in a two-worker sample.
- **Per-slot workspaces.** Answers a question about tools, not about models, and destroys comparability to do it.
- **Passing the user's personal file to all vendors deliberately.** Coherent, and rejected: it makes every answer a house-style answer, which is a variable the fan is not trying to measure. Project conventions carry what the codebase actually requires.
