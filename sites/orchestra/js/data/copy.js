export const FLOOR_STEPS = [
	{
		kicker: 'what', title: 'One question, four models, one answer',
		desc: 'Orchestra is a scheduler. It holds a question, runs several agents over it, moves what each one believes to the others, and decides when the council has argued enough to publish. It does not answer anything itself.',
		formula: 'question → schedule(agents, rounds) → gate → answer',
	},
	{
		kicker: 'who', title: 'The council',
		desc: 'Four agents share a question and a vocabulary but not a temperature or an anchor coefficient. The spread is deliberate: a council of identical agents agrees instantly and tells you nothing.',
		formula: 'Proposer T 0.95 · Verifier T 0.50 · Skeptic T 0.95 · Grounder T 0.62',
	},
	{
		kicker: 'how', title: 'What they send each other',
		desc: 'Not text. Each agent stops at the last hidden state, runs the LM head, softmaxes, keeps the nucleus, and ships that short list of token/probability pairs. The receiver folds it back into one embedding and reads it as a token.',
		formula: 'h → logits → softmax → top-N pairs → Σ q·wte',
	},
	{
		kicker: 'how', title: 'A round',
		desc: 'Propose, broadcast, ingest, revise, arbitrate — every agent in lockstep, one barrier per phase. Peer influence is scaled by λ and decays each round, so early rounds move opinions and late rounds settle them.',
		formula: 'λ_r = λ · decay^r',
	},
	{
		kicker: 'why', title: 'The gate',
		desc: 'The orchestrator publishes only when the council actually agrees: Jensen–Shannon divergence across the four distributions below ε. Run out of rounds with the council still split and it publishes nothing and says so.',
		formula: 'publish ⟺ JSD(p₁…p₄) < ε',
	},
];

export const CHANNEL_STEPS = [
	{
		kicker: 'what', title: 'The message is a distribution',
		desc: 'An agent\'s state at the end of the stack is 768 numbers. Eight are drawn here. Everything the agent has concluded about the next token is in that vector — the channel\'s job is to move it without flattening it first.',
		formula: 'h ∈ ℝ⁷⁶⁸   (8 dimensions drawn)',
	},
	{
		kicker: 'how 1/4', title: 'LM head → logits',
		desc: 'The same linear layer that would produce text produces the message. One dot product per vocabulary row: how much the hidden state looks like that token\'s embedding.',
		formula: 'z = h @ lm_head.weight.T',
	},
	{
		kicker: 'how 2/4', title: 'Softmax → belief',
		desc: 'Temperature is per agent. A low-temperature agent produces a peaked distribution and, further down, a one-token message; a high-temperature one produces a wide message. Confidence rides along the channel for free.',
		formula: 'p = softmax(z / T)',
	},
	{
		kicker: 'how 3/4', title: 'Nucleus → the wire format',
		desc: 'Sending 50,257 floats every round is not a protocol. Keep tokens until either N of them or p of the mass is covered, renormalise, and that short list is the packet. The Verifier fits in one pair; the Skeptic needs four.',
		formula: 'msg = renorm(top-N ∩ nucleus-p of p)',
	},
	{
		kicker: 'how 4/4', title: 'Re-embed → one soft token',
		desc: 'The receiver cannot read a distribution, so it takes its expectation under the sender\'s own embedding table. The result is a single vector in embedding space that gets prepended to the receiver\'s context like any other token.',
		formula: 'e_msg = Σ_v msg[v] · wte[v]',
	},
	{
		kicker: 'why', title: 'Against a text channel',
		desc: 'Collapse the same message to its argmax and you have the text channel: one token, no confidence. Run this council over that and it converges on 10 — the trap answer — because three agents say 10 and nothing records that the fourth was the only one that was sure.',
		formula: 'text: argmax(p)        latent: top-N (v, q)',
	},
];

export const SCHEDULE_STEPS = [
	{
		kicker: 'phase 1', title: 'Propose',
		desc: 'Every agent runs its own forward pass over the question plus whatever peer tokens it was given last round. No agent can see another\'s work yet, so this phase is embarrassingly parallel — the lanes run at once, not in turn.',
		formula: 'parallel ∀a:  h_a ← forward(question, msgs_{r−1})',
	},
	{
		kicker: 'phase 2', title: 'Broadcast',
		desc: 'Each agent\'s distribution is truncated to its packet and handed to the router. Who hears whom is the topology: all-to-all is the default, a ring passes one hop per round, a star routes everything through one agent.',
		formula: 'msg_a = nucleus(p_a)   →   router(topology)',
	},
	{
		kicker: 'phase 3', title: 'Ingest',
		desc: 'A barrier sits here. Every agent folds the packets it received into one vector weighted by sender confidence, so a peer that is sure counts for more than a peer that is guessing. Without the barrier an agent could read a peer\'s round r+1 opinion while still on round r.',
		formula: 'g_b = Σ_{a∈peers(b)} c_a · e_msg,a  /  Σ c_a',
	},
	{
		kicker: 'phase 4', title: 'Revise',
		desc: 'The peer vector is added into the agent\'s own state, scaled by λ for this round and by that agent\'s anchor coefficient, then renormalised to its original length. The renormalisation is what stops repeated rounds from inflating the state.',
		formula: 'h_b ← ‖h_b‖ · unit(h_b + λ_r · κ_b · g_b)',
	},
	{
		kicker: 'phase 5', title: 'Arbitrate',
		desc: 'The orchestrator pools the four distributions into a candidate answer and measures how far apart they still are. Pooling weight is inverse entropy, capped so no single agent can carry a round on its own.',
		formula: 'c_a ∝ 1 / (H(p_a) + 0.2),  capped',
	},
	{
		kicker: 'when', title: 'Stop',
		desc: 'Two exits. Agreement — JSD below ε — publishes. Budget exhausted with the council still split returns no answer and the dissent that caused it. A debate that cannot stop itself is not a scheduler, it is a loop.',
		formula: 'stop ⟺ JSD < ε ∨ r = budget',
	},
];

export const CONSENSUS_STEPS = [
	{ kicker: 'round 0', title: 'Before anyone speaks', desc: 'Three agents open on 10 and one opens on 5. Majority vote and the confidence-weighted pools already disagree with each other, which is the whole problem: there is a number to publish here, and no reason to trust it.', formula: 'JSD = 0.368   ≫ ε' },
	{ kicker: 'round 1', title: 'The first packet lands', desc: 'The Verifier\'s one-token packet is the sharpest thing on the channel, and the Grounder — mid temperature, mid anchor — is the first to move across. Vote flips. The pools were already there.', formula: 'λ₁ = 1.00 · 0.65 = 0.65' },
	{ kicker: 'round 2', title: 'The majority turns', desc: 'The Skeptic follows. Nothing was argued in words: the 5 mass in every agent\'s own second place kept being reinforced by every packet that carried it, and the 10 mass was only ever reinforced by agents that were unsure.', formula: 'λ₂ = 1.00 · 0.65² = 0.42' },
	{ kicker: 'round 3', title: 'Agreement', desc: 'The Proposer moves last. All four distributions now peak on 5, all three pooling rules agree, and JSD has fallen under ε — so the orchestrator stops here rather than spending its remaining budget.', formula: 'JSD = 0.095 < ε = 0.10   → publish' },
	{ kicker: 'round 4', title: 'Past the gate', desc: 'Reached only when the council has not converged by round 3 — a ring topology, a weak λ, or a corrupted member. The distributions keep moving; whether they are moving toward anything is what the gate is for.', formula: 'λ₄ = 1.00 · 0.65⁴ = 0.18' },
	{ kicker: 'round 5', title: 'Budget exhausted', desc: 'The last round the orchestrator will pay for. If JSD is still above ε here, nothing is published: the council reports the split and the dissenting member instead of a number nobody checked.', formula: 'r = budget → withhold' },
];

export const GUARD_STEPS = [
	{
		kicker: 'failure 1', title: 'Echo chamber', kill: { decay: false },
		desc: 'Peer influence that never decays means every round pushes as hard as the first, so the council locks onto whatever was loudest early. Give it a confidently wrong member and it manufactures agreement on that member\'s answer — a consensus about the channel, not about the question.',
		formula: 'λ_r = λ · decay^r,  decay < 1',
		stress: { corrupt: true },
		stressLabel: 'stress: the Proposer\'s sensor is corrupted',
	},
	{
		kicker: 'failure 2', title: 'Hijack', kill: { cap: false },
		desc: 'Confidence-weighted trust is what lets the Verifier win a 3-against-1. It is also what a confidently wrong agent exploits. The cap bounds any one member\'s share of the pool and clamps the norm of any one packet, so being certain buys influence but never all of it.',
		formula: 'c_a ← (1−cap)·c_a + cap/n,   ‖e_msg‖ ≤ 0.85',
		stress: { corrupt: true, lambda: 1.5 },
		stressLabel: 'stress: corrupted Proposer, λ 1.5',
	},
	{
		kicker: 'failure 3', title: 'Herd drift', kill: { anchor: false },
		desc: 'Anchor coefficients make agents move at different rates. Set them all to 1 and the council moves as one body — the Verifier drifts off the answer it was right about, and nobody is left holding the position that would have registered as dissent at the gate.',
		formula: 'h_b ← h_b + λ_r · κ_b · g_b,  κ per agent',
		stress: { topN: 2 },
		stressLabel: 'stress: two-pair packets',
	},
	{
		kicker: 'failure 4', title: 'Unbounded channel', kill: { nucleus: false },
		desc: 'Without the cut, every packet carries the whole tail: four pairs, one pair and three pairs all become nine. Confident and unconfident agents sound alike on the wire, the channel stops transmitting certainty, and on a slow topology the council agrees on the first hop about nothing.',
		formula: 'msg = renorm(top-N ∩ nucleus-p)',
		stress: { lambda: 2.5, eps: 0.25, topology: 'ring', topN: 3 },
		stressLabel: 'stress: ring topology, λ 2.5, ε 0.25',
	},
];
