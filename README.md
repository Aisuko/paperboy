<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06060a,50:8b7bff,100:35d0ba&height=200&section=header&text=paperboy&fontSize=64&fontColor=eef0fb&fontAlignY=38&animation=fadeIn&desc=a%20GNU%2FHurd%203D%20field%20guide,%20built%20while%20arguing%20with%20myself%20about%20AI&descSize=16&descAlignY=62" alt="paperboy banner" width="100%" />

<a href="https://aisuko.github.io/paperboy/sites/hurd/">
  <img src="https://readme-typing-svg.demolab.com/?font=JetBrains+Mono&size=18&pause=1200&color=8B7BFF&center=true&vCenter=true&width=760&lines=Modern+AI+agents+could+help+GNU+Hurd+a+lot...;...but+GNU+Hurd+does+not+let+AI+write+its+code.;So+what+is+%22real%22+free+software%2C+really%3F" alt="Typing SVG" />
</a>

[![GNU Hurd](https://img.shields.io/badge/subject-GNU%2FHurd-ff5da2?style=flat-square)](https://www.gnu.org/software/hurd/)
[![Savannah member since 2021](https://img.shields.io/badge/savannah-member%20since%202021-8b7bff?style=flat-square)](https://savannah.gnu.org/project/memberlist.php?group=hurd)
[![Built with three.js](https://img.shields.io/badge/built%20with-three.js-35d0ba?style=flat-square)](references/three.js)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-eef0fb?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/github/actions/workflow/status/Aisuko/paperboy/deploy-pages.yml?style=flat-square&label=pages&color=8b7bff)](https://github.com/Aisuko/paperboy/actions/workflows/deploy-pages.yml)

</div>

<p align="center"><em>Drag to orbit &middot; scroll to zoom &middot; click any module &mdash; <a href="https://aisuko.github.io/paperboy/sites/hurd/">launch the live 3D tour</a></em></p>

---

## 01 &middot; Why this repo exists

> I joined the [GNU Hurd project on Savannah](https://savannah.gnu.org/project/memberlist.php?group=hurd) back in **2021**. The learning curve was — and still is — brutal: a multiserver microkernel, GNU Mach, translators, capability-passing ports, decades of mailing-list history. I never shipped a patch(It's hard for me(GitHub generation) to use email to do the PR and it my problem of course).

That gap is the reason this repository exists. [`sites/hurd`](sites/hurd/) is an interactive three.js explainer of the Hurd's microkernel core, its components, and its boot sequence — the field guide I wish I'd had in 2021, built so the next person doesn't bounce off the learning curve the way I did.

It's also a small experiment with a bigger question underneath it, explained below.

## 02 &middot; An idea, an email, and an answer I didn't expect

My working idea was simple: **modern AI coding agents could make a real dent in the Hurd's backlog** — triaging decades-old bugs, mapping unfamiliar subsystems, drafting patches for a project that is chronically short on contributor-hours.

So I emailed a few other Hurd contributors to talk it through, prompted by the project's own [2026 Q1 news post](https://www.gnu.org/software/hurd/news/2026-q1.html). That post already answers the question, and not the way I expected:

> Brent W. Baccala worked with a Claude AI bot to debug x86_64 SMP issues. The bot **did not contribute any code** — it just found some incorrect code, which a human contributor then fixed. It also got some things wrong.

The Hurd is happy to let an AI *read* — to scan, to flag, to point at a suspicious `spin_lock` or a stale comment. It draws a hard line at letting an AI *write* the fix. A human has to understand the code well enough to author the patch and take responsibility for it.

## 03 &middot; What that line taught me about "free"

That answer is what sent me down a rabbit hole: **what does "free software" actually mean, once you compare it to how "open" software gets built today?**

The Hurd's line isn't about code quality — Claude found real bugs. It's about *authorship and accountability*, which the Free Software Foundation has always tied to the four freedoms, not to a license file:

<details>
<summary><strong>The four freedoms, for reference</strong></summary>

<br>

| # | Freedom | In practice |
|---|---------|--------------|
| 0 | Run the program, for any purpose | No EULA telling you what you're allowed to use it for |
| 1 | Study how it works, and change it | Source you can actually read, on a system you control |
| 2 | Redistribute copies | Help your neighbor, no gatekeeper in between |
| 3 | Distribute your modified versions | The improvement goes back to the commons, not to one company |

</details>

Compare that to how a lot of "open" AI work happens in 2026: weights you can download but training data you'll never see, "open" models built by companies whose product *is* the model, code-review bots with no accountable human behind the diff. It's open in the marketing sense, not in the Freedom 1 sense — you can't actually study or verify most of what made the thing behave the way it does.

The Hurd's rule — *AI may look, a human must write and sign off* — is a small, deliberate act of keeping authorship where the four freedoms put it. That's the real distinction I was missing when I first framed this as "AI agents will help the Hurd." The interesting part was never whether AI *can* help. It's who stays accountable for the result.

## 04 &middot; What's actually in this repo

| Path | What it is |
|---|---|
| [`index.html`](index.html) | Landing page for the project(s) hosted here |
| [`sites/hurd/`](sites/hurd/) | The 3D GNU Hurd field guide — microkernel, components, boot sequence, monolithic-vs-micro comparison ([live](https://aisuko.github.io/paperboy/sites/hurd/)) |
| [`references/three.js/`](references/three.js/) | Vendored three.js source + examples, used as a reference while building the scenes |
| [`references/transformer-explainer/`](references/transformer-explainer/) | Reference for the "make the process transparent, start to end" interaction style |
| [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) | Publishes `index.html` + `sites/` to GitHub Pages on every push to `main` |

> Note on process: the `sites/hurd` scenes in this repo were built with an AI coding agent (Claude Code) writing the code — the opposite of the Hurd's own rule above. That's on purpose: this repo is a demo/teaching site *about* the Hurd, not a patch submitted *to* it. The distinction in section 03 is exactly why those two things are allowed to be held to different standards.

## 05 &middot; Run it locally

No build step — it's static HTML/CSS/three.js.

```bash
git clone https://github.com/Aisuko/paperboy.git
cd paperboy
python3 -m http.server 8000
# then open http://localhost:8000
```

## 06 &middot; Further reading

- [GNU Hurd — official project page](https://www.gnu.org/software/hurd/)
- [GNU Hurd — Wikipedia](https://en.wikipedia.org/wiki/GNU_Hurd)
- [GNU Hurd Savannah project & member list](https://savannah.gnu.org/project/memberlist.php?group=hurd)
- [GNU Hurd news, 2026 Q1](https://www.gnu.org/software/hurd/news/2026-q1.html)
- [What is free software? — GNU](https://www.gnu.org/philosophy/free-sw.html)

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:35d0ba,50:8b7bff,100:06060a&height=100&section=footer" alt="footer" width="100%" />
</div>
