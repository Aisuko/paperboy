import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildFloorWorld } from './worlds/floor.js';
import { buildChannelWorld } from './worlds/channel.js';
import { buildScheduleWorld } from './worlds/schedule.js';
import { buildConsensusWorld } from './worlds/consensus.js';
import { buildGuardsWorld } from './worlds/guards.js';

import { FLOOR_STEPS, CHANNEL_STEPS, SCHEDULE_STEPS, CONSENSUS_STEPS, GUARD_STEPS } from './data/copy.js';
import {
	AGENTS, ORCH, QUESTION, ANSWER, TRAP, TOKENS, DEFAULTS, TOPOLOGIES,
	debate, label, ranked, argmax, fmtVec, peersOf,
} from './data/model.js';

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 30, 1, 0.1, 400 );
camera.position.set( 0, 7.4, 16.5 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.62;

const renderPipeline = createRenderPipeline( renderer );
bindViewport( viewport, camera, [ renderer, labelRenderer ] );

const worlds = {
	floor: buildFloorWorld(),
	channel: buildChannelWorld(),
	schedule: buildScheduleWorld(),
	consensus: buildConsensusWorld(),
	guards: buildGuardsWorld(),
};

const STEPS = {
	floor: FLOOR_STEPS,
	channel: CHANNEL_STEPS,
	schedule: SCHEDULE_STEPS,
	consensus: CONSENSUS_STEPS,
	guards: GUARD_STEPS,
};

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.24, radius: 0.6, threshold: 0.6 } );

let currentKey = 'floor';
renderPipeline.outputNode = sceneOutputs.floor;

const proc = new ProcessConsole( document.getElementById( 'console' ) );

function flyTo( view, duration = 0.9 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

function setCard( key, index ) {

	const card = document.querySelector( `[data-card="${ key }"]` );
	const step = STEPS[ key ][ index ];
	card.querySelector( '[data-role="kicker"]' ).textContent = step.kicker;
	card.querySelector( '[data-role="num"]' ).textContent = index + 1;
	card.querySelector( '[data-role="total"]' ).textContent = STEPS[ key ].length;
	card.querySelector( '[data-role="title"]' ).textContent = step.title;
	card.querySelector( '[data-role="desc"]' ).textContent = step.desc;
	card.querySelector( '[data-role="formula"]' ).textContent = step.formula;

}

function makeScrubber( key, count, onStep ) {

	const root = document.querySelector( `.scrubber[data-scrub="${ key }"]` );
	const track = root.querySelector( '.scrubber-track' );
	const nodes = [];
	let index = 0;
	let timer = null;

	function paint() {

		nodes.forEach( ( n, i ) => {

			n.classList.toggle( 'active', i === index );
			n.classList.toggle( 'done', i < index );

		} );

	}

	function stop() {

		if ( timer ) { clearInterval( timer ); timer = null; }
		root.querySelector( '[data-act="play"]' ).innerHTML = PLAY_ICON;

	}

	function go( i ) {

		index = Math.max( 0, Math.min( count - 1, i ) );
		paint();
		onStep( index );

	}

	for ( let i = 0; i < count; i ++ ) {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.addEventListener( 'click', () => { stop(); go( i ); } );
		track.appendChild( node );
		nodes.push( node );

	}

	root.querySelector( '[data-act="prev"]' ).addEventListener( 'click', () => { stop(); go( index - 1 ); } );
	root.querySelector( '[data-act="next"]' ).addEventListener( 'click', () => { stop(); go( index + 1 ); } );
	root.querySelector( '[data-act="play"]' ).addEventListener( 'click', ( e ) => {

		if ( timer ) { stop(); return; }
		e.currentTarget.innerHTML = PAUSE_ICON;
		if ( index >= count - 1 ) go( 0 );
		timer = setInterval( () => {

			if ( index >= count - 1 ) { stop(); return; }
			go( index + 1 );

		}, 3600 );

	} );

	paint();
	return { go, stop, get index() { return index; } };

}

/* -------------------------------------------------------------- run state */

const params = { ...DEFAULTS, guards: { ...DEFAULTS.guards } };
let run = debate( params );
let roundIndex = 0;

const guardRuns = { kept: run, broken: run };

function clampRound() {

	roundIndex = Math.min( roundIndex, run.rounds.length - 1 );
	[ 'floor-round', 'sched-round' ].forEach( ( id ) => {

		const el = document.getElementById( id );
		el.max = String( run.rounds.length - 1 );
		el.value = String( roundIndex );

	} );
	document.getElementById( 'floor-round-readout' ).textContent = roundIndex;
	document.getElementById( 'sched-round-readout' ).textContent = roundIndex;

}

function refreshGuards() {

	const g = GUARD_STEPS[ worlds.guards.getStep() ];
	const base = { ...DEFAULTS, ...g.stress };
	guardRuns.kept = debate( { ...base, guards: { ...DEFAULTS.guards } } );
	guardRuns.broken = debate( { ...base, guards: { ...DEFAULTS.guards, ...g.kill } } );
	worlds.guards.setRuns( guardRuns );

}

function recompute() {

	run = debate( params );
	clampRound();
	worlds.floor.setRun( run );
	worlds.channel.setRun( run );
	worlds.schedule.setRun( run );
	worlds.consensus.setRun( run );
	worlds.floor.setRound( roundIndex );
	worlds.channel.setRound( roundIndex );
	worlds.schedule.setRound( roundIndex );
	renderTables();

}

function setRound( r ) {

	roundIndex = Math.max( 0, Math.min( run.rounds.length - 1, r ) );
	clampRound();
	worlds.floor.setRound( roundIndex );
	worlds.channel.setRound( roundIndex );
	worlds.schedule.setRound( roundIndex );
	renderTables();

}

function current() { return run.rounds[ Math.min( roundIndex, run.rounds.length - 1 ) ]; }

/* ----------------------------------------------------------------- tables */

function renderTables() {

	renderFloorTable();
	renderChannelTable();
	renderSchedTable();
	renderConsensusTable();

}

function renderFloorTable() {

	const rd = current();
	document.getElementById( 'floor-table' ).innerHTML = `
		<thead><tr><th>agent</th><th>believes</th><th>c</th></tr></thead>
		<tbody>${ AGENTS.map( ( a, i ) => {

			const s = rd.per[ i ];
			return `<tr class="${ s.top === 0 ? 'is-top' : '' }"><td class="name">${ a.short }</td><td class="tok">${ label( s.top ) } ${ Math.max( ...s.p ).toFixed( 2 ) }</td><td class="num">${ s.conf.toFixed( 3 ) }</td></tr>`;

		} ).join( '' ) }</tbody>
		<tfoot><tr><td class="name">pooled</td><td class="tok">${ label( rd.top ) } ${ Math.max( ...rd.pooled ).toFixed( 2 ) }</td><td class="num">${ rd.jsd.toFixed( 3 ) }</td></tr></tfoot>`;

	document.getElementById( 'floor-summary' ).textContent =
		`round ${ rd.r } / ${ params.budget } · ${ TOPOLOGIES[ params.topology ] } · JSD ${ rd.jsd.toFixed( 3 ) } ${ rd.jsd < params.eps ? '<' : '≥' } ε ${ params.eps.toFixed( 2 ) }`;

}

function renderChannelTable() {

	const s = worlds.channel.getState();
	const kept = new Set( s.msg.map( ( m ) => m.v ) );
	const rows = ranked( s.p, TOKENS.length + 1 ).slice( 0, 6 );

	document.getElementById( 'channel-table' ).innerHTML = `
		<thead><tr><th>token</th><th>p</th><th>packet</th></tr></thead>
		<tbody>${ rows.map( ( r, i ) => {

			const q = s.msg.find( ( m ) => m.v === r.v );
			const cls = [ i === 0 ? 'is-top' : '', ! kept.has( r.v ) ? 'is-dropped' : '', r.v >= TOKENS.length ? 'is-tail' : '', r.v === 1 ? 'is-trap' : '' ].join( ' ' );
			return `<tr class="${ cls }"><td class="tok">${ r.v >= TOKENS.length ? 'tail' : TOKENS[ r.v ].trim() }</td><td class="num">${ r.p.toFixed( 4 ) }</td><td class="num">${ q ? q.q.toFixed( 4 ) : '—' }</td></tr>`;

		} ).join( '' ) }</tbody>`;

	document.getElementById( 'channel-summary' ).textContent =
		`${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' } · mass ${ s.msgMass.toFixed( 3 ) } · ${ s.msgBits.toFixed( 2 ) } bits · ‖e‖ ${ Math.hypot( ...s.u ).toFixed( 3 ) } of ${ s.rawNorm.toFixed( 3 ) }`;

}

function renderSchedTable() {

	const rd = current();
	document.getElementById( 'sched-table' ).innerHTML = `
		<tbody>
			<tr><td>round</td><td class="num">${ rd.r } / ${ params.budget }</td></tr>
			<tr><td>topology</td><td class="num">${ TOPOLOGIES[ params.topology ] }</td></tr>
			<tr><td>λ this round</td><td class="num">${ rd.lambda.toFixed( 3 ) }</td></tr>
			<tr><td>pool</td><td class="num">${ params.mode }</td></tr>
			<tr><td>JSD</td><td class="num">${ rd.jsd.toFixed( 3 ) }</td></tr>
			<tr class="${ rd.jsd < params.eps ? 'is-top' : '' }"><td>gate</td><td class="num">${ rd.jsd < params.eps ? 'open' : 'closed' }</td></tr>
		</tbody>`;

}

function renderConsensusTable() {

	document.getElementById( 'consensus-table' ).innerHTML = `
		<thead><tr><th>r</th><th>pooled</th><th>JSD</th></tr></thead>
		<tbody>${ run.rounds.map( ( rd ) => `<tr class="${ rd.jsd < params.eps ? 'is-top' : '' }"><td class="num">${ rd.r }</td><td class="tok">${ label( rd.top ) }</td><td class="num">${ rd.jsd.toFixed( 3 ) }</td></tr>` ).join( '' ) }</tbody>`;

	document.getElementById( 'consensus-summary' ).textContent = run.published
		? `published "${ run.answer.trim() }" at round ${ run.stoppedAt }${ run.correct ? ' — correct' : ' — wrong' }`
		: `withheld at round ${ run.stoppedAt } — JSD ${ run.final.jsd.toFixed( 3 ) } ≥ ε ${ params.eps.toFixed( 2 ) }`;

}

function renderGuardsTable() {

	const step = GUARD_STEPS[ worlds.guards.getStep() ];
	const rows = [ [ 'all guards on', guardRuns.kept ], [ `${ Object.keys( step.kill )[ 0 ] } off`, guardRuns.broken ] ];
	document.getElementById( 'guards-table' ).innerHTML = `
		<thead><tr><th>run</th><th>answer</th><th>JSD</th></tr></thead>
		<tbody>${ rows.map( ( [ name, r ], i ) => `<tr class="${ r.correct ? 'is-top' : i === 1 ? 'is-off' : '' }"><td class="name">${ name }</td><td class="tok">${ r.published ? r.answer.trim() : 'withheld' }</td><td class="num">${ r.final.jsd.toFixed( 3 ) }</td></tr>` ).join( '' ) }</tbody>`;

}

/* -------------------------------------------------------------- 01 floor */

const floorScrub = makeScrubber( 'floor', FLOOR_STEPS.length, ( i ) => {

	worlds.floor.setStep( i );
	setCard( 'floor', i );
	floorTrace( i );
	flyTo( worlds.floor.getStepView( i ) );

} );

function floorHeader() {

	proc.clear();
	proc.setTitle( 'orchestra — scheduler' );
	proc.setStatus( 'converged', run.published ? 'done' : 'error' );
	proc.write( `question  ${ QUESTION }`, 'cmd' );
	proc.write( `council   ${ AGENTS.map( ( a ) => a.short ).join( ' · ' ) }`, 'dim' );
	proc.write( `channel   latent · top-${ params.topN } ∩ p ${ params.nucleus.toFixed( 2 ) }`, 'dim' );
	proc.write( `budget    ${ params.budget } rounds · ε ${ params.eps.toFixed( 2 ) } · ${ TOPOLOGIES[ params.topology ] }`, 'dim' );
	proc.rule();

}

function floorTrace( i ) {

	const rd = current();
	proc.write( `${ i + 1 }. ${ FLOOR_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'schedule(agents, rounds) → gate → answer', 'cmd' );
		proc.write( 'the orchestrator holds no model — it routes, weights and decides when to stop', 'out' );

	} else if ( i === 1 ) {

		AGENTS.forEach( ( a ) => proc.write( `${ a.short }  T ${ a.temp.toFixed( 2 ) }  κ ${ a.anchor.toFixed( 2 ) }  — ${ a.role }`, 'out' ) );
		proc.write( 'identical agents agree instantly and tell you nothing', 'note' );

	} else if ( i === 2 ) {

		const s = rd.per[ 1 ];
		proc.write( 'h → logits → softmax → top-N pairs → Σ q·wte', 'cmd' );
		proc.write( `VER packet  ${ s.msg.map( ( m ) => `${ label( m.v ) }:${ m.q.toFixed( 3 ) }` ).join( '  ' ) }`, 'calc' );
		proc.write( `SKE packet  ${ rd.per[ 2 ].msg.map( ( m ) => `${ label( m.v ) }:${ m.q.toFixed( 3 ) }` ).join( '  ' ) }`, 'out' );

	} else if ( i === 3 ) {

		proc.write( 'propose → broadcast → ingest → revise → arbitrate', 'cmd' );
		proc.write( `λ_${ rd.r } = ${ params.lambda.toFixed( 2 ) } · ${ params.decay.toFixed( 2 ) }^${ rd.r } = ${ rd.lambda.toFixed( 3 ) }`, 'calc' );
		proc.write( `weights  ${ rd.conf.map( ( c, a ) => `${ AGENTS[ a ].short } ${ c.toFixed( 3 ) }` ).join( '  ' ) }`, 'out' );

	} else {

		proc.write( `JSD(p₁…p₄) = ${ rd.jsd.toFixed( 4 ) }   ε = ${ params.eps.toFixed( 2 ) }`, 'cmd' );
		if ( rd.jsd < params.eps ) proc.write( `gate open → publish "${ label( rd.top ) }"`, 'ok' );
		else proc.write( `gate closed — ${ ( rd.jsd - params.eps ).toFixed( 3 ) } above ε, keep arguing`, 'warn' );
		proc.write( run.published ? `run stops at round ${ run.stoppedAt } by ${ run.reason }` : `run ends at round ${ run.stoppedAt } with nothing published`, run.published ? 'ok' : 'err' );

	}

}

document.getElementById( 'floor-round' ).addEventListener( 'input', ( e ) => {

	setRound( parseInt( e.target.value, 10 ) );
	floorTrace( floorScrub.index );

} );

document.querySelectorAll( '#topology-chips, #topology-chips-2' ).forEach( ( row ) => row.addEventListener( 'click', ( e ) => {

	const btn = e.target.closest( '.chip' );
	if ( ! btn ) return;
	params.topology = btn.dataset.topology;
	syncChips();
	recompute();
	proc.write( `topology = ${ TOPOLOGIES[ params.topology ] } → ${ run.published ? `publishes "${ run.answer.trim() }" at r${ run.stoppedAt }` : `withholds after ${ run.stoppedAt } rounds` }`, 'warn' );

} ) );

/* ------------------------------------------------------------ 02 channel */

const agentChips = document.getElementById( 'agent-chips' );
AGENTS.forEach( ( a, i ) => {

	const chip = document.createElement( 'button' );
	chip.className = 'chip' + ( i === 1 ? ' active' : '' );
	chip.textContent = a.short;
	chip.addEventListener( 'click', () => {

		worlds.channel.setAgent( i );
		[ ...agentChips.children ].forEach( ( c, j ) => c.classList.toggle( 'active', j === i ) );
		channelHeader();
		channelTrace( chanScrub.index );
		renderChannelTable();

	} );
	agentChips.appendChild( chip );

} );

const chanScrub = makeScrubber( 'channel', CHANNEL_STEPS.length, ( i ) => {

	worlds.channel.setStep( i );
	setCard( 'channel', i );
	channelTrace( i );
	flyTo( worlds.channel.getStepView( i ) );

} );

function channelHeader() {

	const a = AGENTS[ worlds.channel.getAgent() ];
	proc.clear();
	proc.setTitle( `latent channel — ${ a.name }` );
	proc.setStatus( 'encoded', 'done' );
	proc.write( `h        ${ fmtVec( worlds.channel.getState().h ) }   (${ 8 } of ${ ORCH.dModel })`, 'cmd' );
	proc.write( `lm_head  [${ ORCH.vocab.toLocaleString( 'en-AU' ) } × ${ ORCH.dModel }]  ·  tied to wte  ·  no bias`, 'dim' );
	proc.write( `T ${ a.temp.toFixed( 2 ) }  ·  top-${ params.topN } ∩ p ${ params.nucleus.toFixed( 2 ) }`, 'dim' );
	proc.rule();

}

function channelTrace( i ) {

	const s = worlds.channel.getState();
	const a = AGENTS[ worlds.channel.getAgent() ];
	proc.write( `${ i + 1 }. ${ CHANNEL_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( `h        ${ fmtVec( s.h ) }`, 'out' );
		proc.write( `‖h‖ = ${ Math.hypot( ...s.h ).toFixed( 3 ) }  ·  nothing here names a token yet`, 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'z = h @ lm_head.weight.T', 'cmd' );
		ranked( s.p, 4 ).forEach( ( r ) => proc.write( `z["${ label( r.v ) }"] = ${ s.logits[ r.v ].toFixed( 4 ) }`, 'out' ) );
		proc.write( `range    ${ Math.min( ...s.logits ).toFixed( 3 ) } … ${ Math.max( ...s.logits ).toFixed( 3 ) }`, 'dim' );

	} else if ( i === 2 ) {

		proc.write( `p = softmax(z / ${ a.temp.toFixed( 2 ) })`, 'cmd' );
		ranked( s.p, 4 ).forEach( ( r ) => proc.write( `p["${ label( r.v ) }"] = ${ r.p.toFixed( 4 ) }`, 'out' ) );
		proc.write( `H = ${ s.H.toFixed( 3 ) } nats  →  pooling weight ${ s.conf.toFixed( 3 ) }`, 'calc' );

	} else if ( i === 3 ) {

		proc.write( `msg = renorm(top-${ params.topN } ∩ nucleus-${ params.nucleus.toFixed( 2 ) })`, 'cmd' );
		s.msg.forEach( ( m ) => proc.write( `  ${ label( m.v ).padEnd( 6 ) } p ${ s.p[ m.v ].toFixed( 4 ) }  →  q ${ m.q.toFixed( 4 ) }`, 'out' ) );
		proc.write( `${ s.msg.length } of ${ ORCH.vocab.toLocaleString( 'en-AU' ) } tokens · raw mass ${ s.msgMass.toFixed( 4 ) } → 1.000 · ${ s.msgBits.toFixed( 2 ) } bits`, 'ok' );

	} else if ( i === 4 ) {

		proc.write( 'e_msg = Σ_v msg[v] · wte[v]', 'cmd' );
		proc.write( `e_msg    ${ fmtVec( s.u ) }`, 'calc' );
		proc.write( `‖e_msg‖  ${ s.rawNorm.toFixed( 3 ) } raw → ${ Math.hypot( ...s.u ).toFixed( 3 ) } after the cap at ${ params.uCap.toFixed( 2 ) }`, 'out' );
		proc.write( 'the receiver prepends this like any other token embedding', 'note' );

	} else {

		const top = argmax( s.p );
		const text = debate( { ...params, topN: 1, nucleus: 0 } );
		proc.write( `text channel   argmax(p) = "${ label( top ) }"   1 token, no confidence`, 'warn' );
		proc.write( `latent channel ${ s.msg.map( ( m ) => `${ label( m.v ) }:${ m.q.toFixed( 3 ) }` ).join( '  ' ) }`, 'calc' );
		proc.write( `debate(topN=1)  → ${ text.published ? `"${ text.answer.trim() }" at r${ text.stoppedAt }` : `withheld after ${ text.stoppedAt }` }   ${ text.correct ? '' : `the trap "${ TRAP.trim() }"` }`, text.correct ? 'ok' : 'err' );
		proc.write( `debate(topN=${ params.topN }) → ${ run.published ? `"${ run.answer.trim() }" at r${ run.stoppedAt }` : `withheld after ${ run.stoppedAt }` }`, run.correct ? 'ok' : 'warn' );
		proc.write( `three agents say "${ TRAP.trim() }" and only the argmax survives the collapse — nothing records that the fourth was the sure one`, 'note' );
		proc.write( `answer is "${ ANSWER.trim() }"`, 'dim' );

	}

}

document.getElementById( 'topn-slider' ).addEventListener( 'input', ( e ) => {

	params.topN = parseInt( e.target.value, 10 );
	document.getElementById( 'topn-readout' ).textContent = params.topN;
	recompute();

} );

document.getElementById( 'nucleus-slider' ).addEventListener( 'input', ( e ) => {

	params.nucleus = parseFloat( e.target.value );
	document.getElementById( 'nucleus-readout' ).textContent = params.nucleus.toFixed( 2 );
	recompute();

} );

[ 'topn-slider', 'nucleus-slider' ].forEach( ( id ) => document.getElementById( id ).addEventListener( 'change', () => {

	const s = worlds.channel.getState();
	proc.write( `top-${ params.topN } ∩ p ${ params.nucleus.toFixed( 2 ) }  →  ${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' }, ${ s.msgBits.toFixed( 2 ) } bits  ·  run ${ run.published ? `publishes "${ run.answer.trim() }"` : 'withholds' }`, 'calc' );

} ) );

/* ----------------------------------------------------------- 03 schedule */

const schedScrub = makeScrubber( 'schedule', SCHEDULE_STEPS.length, ( i ) => {

	worlds.schedule.setStep( i );
	setCard( 'schedule', i );
	schedTrace( i );
	flyTo( worlds.schedule.getStepView( i ) );

} );

function schedHeader() {

	proc.clear();
	proc.setTitle( 'scheduler — one round' );
	proc.setStatus( 'lockstep', 'running' );
	proc.write( `round ${ current().r } of ${ params.budget }  ·  ${ TOPOLOGIES[ params.topology ] }`, 'cmd' );
	proc.write( `phases   propose → broadcast → ingest → revise → arbitrate`, 'dim' );
	proc.rule();

}

function schedTrace( i ) {

	const rd = current();
	proc.write( `${ i + 1 }. ${ SCHEDULE_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'parallel ∀a: h_a ← forward(question, msgs_{r−1})', 'cmd' );
		rd.per.forEach( ( s, a ) => proc.write( `${ AGENTS[ a ].short }  top "${ label( s.top ) }" ${ Math.max( ...s.p ).toFixed( 3 ) }  H ${ s.H.toFixed( 3 ) }`, 'out' ) );

	} else if ( i === 1 ) {

		rd.per.forEach( ( s, a ) => {

			const heard = AGENTS.map( ( _, b ) => b ).filter( ( b ) => b !== a && peersOf( b, params.topology, AGENTS.length ).includes( a ) );
			proc.write( `${ AGENTS[ a ].short } → ${ heard.map( ( b ) => AGENTS[ b ].short ).join( ',' ) || '—' }   ${ s.msg.map( ( m ) => `${ label( m.v ) }:${ m.q.toFixed( 2 ) }` ).join( ' ' ) }`, 'out' );

		} );
		proc.write( `router: ${ TOPOLOGIES[ params.topology ] }`, 'calc' );

	} else if ( i === 2 ) {

		proc.write( 'g_b = Σ_{a∈peers(b)} c_a · e_msg,a / Σ c_a', 'cmd' );
		proc.write( `weights  ${ rd.conf.map( ( c, a ) => `${ AGENTS[ a ].short } ${ c.toFixed( 3 ) }` ).join( '  ' ) }`, 'out' );
		proc.write( 'the barrier is what stops an agent reading a peer’s round r+1 opinion on round r', 'note' );

	} else if ( i === 3 ) {

		proc.write( 'h_b ← ‖h_b‖ · unit(h_b + λ_r · κ_b · g_b)', 'cmd' );
		proc.write( `λ_${ rd.r } = ${ params.lambda.toFixed( 2 ) } · ${ params.decay.toFixed( 2 ) }^${ rd.r } = ${ rd.lambda.toFixed( 4 ) }`, 'calc' );
		AGENTS.forEach( ( a ) => proc.write( `${ a.short }  effective step ${ ( rd.lambda * a.anchor ).toFixed( 4 ) }`, 'out' ) );

	} else if ( i === 4 ) {

		proc.write( 'c_a ∝ 1 / (H(p_a) + 0.2), capped', 'cmd' );
		proc.write( `pooled   ${ ranked( rd.pooled, 3 ).map( ( r ) => `${ label( r.v ) }:${ r.p.toFixed( 3 ) }` ).join( '  ' ) }`, 'calc' );
		proc.write( `JSD      ${ rd.jsd.toFixed( 4 ) }`, 'out' );

	} else {

		proc.write( 'stop ⟺ JSD < ε ∨ r = budget', 'cmd' );
		proc.write( `now      JSD ${ rd.jsd.toFixed( 4 ) } vs ε ${ params.eps.toFixed( 2 ) }`, rd.jsd < params.eps ? 'ok' : 'warn' );
		proc.write( run.published ? `run stops at r${ run.stoppedAt } — publishes "${ run.answer.trim() }"` : `run ends at r${ run.stoppedAt } — withholds and reports the split`, run.published ? 'ok' : 'err' );

	}

}

document.getElementById( 'sched-round' ).addEventListener( 'input', ( e ) => {

	setRound( parseInt( e.target.value, 10 ) );
	schedTrace( schedScrub.index );

} );

/* ---------------------------------------------------------- 04 consensus */

const consScrub = makeScrubber( 'consensus', CONSENSUS_STEPS.length, ( i ) => {

	setRound( i );
	worlds.consensus.setRound( roundIndex );
	setCard( 'consensus', i );
	consTrace( i );
	flyTo( worlds.consensus.getStepView( i ) );

} );

function consHeader() {

	proc.clear();
	proc.setTitle( 'consensus — the bat and the ball' );
	proc.setStatus( run.published ? 'converged' : 'withheld', run.published ? 'done' : 'error' );
	proc.write( `question  ${ QUESTION }`, 'cmd' );
	proc.write( `answer    "${ ANSWER.trim() }"   trap "${ TRAP.trim() }"`, 'dim' );
	proc.write( `λ ${ params.lambda.toFixed( 2 ) } · decay ${ params.decay.toFixed( 2 ) } · ε ${ params.eps.toFixed( 2 ) } · ${ params.mode } pool${ params.corrupt ? ' · PRO corrupted' : '' }`, 'dim' );
	proc.rule();

}

function consTrace( i ) {

	const rd = run.rounds[ Math.min( i, run.rounds.length - 1 ) ];
	proc.write( `${ i + 1 }. ${ CONSENSUS_STEPS[ i ].title }`, 'head' );

	if ( i >= run.rounds.length ) {

		proc.write( `round ${ i } never ran — the debate stopped at r${ run.stoppedAt } by ${ run.reason }`, 'dim' );
		return;

	}

	rd.per.forEach( ( s, a ) => proc.write( `${ AGENTS[ a ].short }  "${ label( s.top ) }" ${ Math.max( ...s.p ).toFixed( 3 ) }   c ${ s.conf.toFixed( 3 ) }   msg ${ s.msg.length }`, s.top === 0 ? 'ok' : 'out' ) );
	proc.write( `pooled   "${ label( rd.top ) }" ${ Math.max( ...rd.pooled ).toFixed( 3 ) }   λ ${ rd.lambda.toFixed( 3 ) }`, 'calc' );
	proc.write( `JSD      ${ rd.jsd.toFixed( 4 ) } ${ rd.jsd < params.eps ? '<' : '≥' } ε ${ params.eps.toFixed( 2 ) }`, rd.jsd < params.eps ? 'ok' : 'warn' );

}

function bindConsSlider( id, key, digits, readout ) {

	document.getElementById( id ).addEventListener( 'input', ( e ) => {

		params[ key ] = parseFloat( e.target.value );
		document.getElementById( readout ).textContent = params[ key ].toFixed( digits );
		recompute();
		worlds.consensus.setRound( roundIndex );

	} );

	document.getElementById( id ).addEventListener( 'change', () => {

		proc.write( `${ key } = ${ params[ key ].toFixed( digits ) }  →  ${ run.published ? `"${ run.answer.trim() }" at r${ run.stoppedAt }` : `withheld after ${ run.stoppedAt } rounds` }`, run.correct ? 'ok' : 'warn' );

	} );

}

bindConsSlider( 'lambda-slider', 'lambda', 2, 'lambda-readout' );
bindConsSlider( 'decay-slider', 'decay', 2, 'decay-readout' );
bindConsSlider( 'eps-slider', 'eps', 2, 'eps-readout' );

document.getElementById( 'mode-chips' ).addEventListener( 'click', ( e ) => {

	const btn = e.target.closest( '.chip' );
	if ( ! btn ) return;
	params.mode = btn.dataset.mode;
	syncChips();
	recompute();
	worlds.consensus.setRound( roundIndex );
	proc.write( `pool = ${ params.mode }  →  pooled "${ label( current().top ) }"`, 'warn' );

} );

document.getElementById( 'corrupt-btn' ).addEventListener( 'click', () => {

	params.corrupt = ! params.corrupt;
	const btn = document.getElementById( 'corrupt-btn' );
	btn.textContent = params.corrupt ? 'Restore the Proposer' : 'Corrupt the Proposer';
	btn.classList.toggle( 'is-danger', params.corrupt );
	recompute();
	worlds.consensus.setRound( roundIndex );
	proc.write( params.corrupt
		? `PRO corrupted — T ${ 0.18 } on the trap answer, and it now carries pooling weight ${ current().per[ 0 ].conf.toFixed( 3 ) }`
		: 'PRO restored', params.corrupt ? 'err' : 'ok' );
	proc.write( run.published ? `run → "${ run.answer.trim() }" at r${ run.stoppedAt }${ run.correct ? '' : ' — wrong' }` : `run → withheld after ${ run.stoppedAt } rounds`, run.correct ? 'ok' : 'warn' );

} );

/* ------------------------------------------------------------- 05 guards */

const guardScrub = makeScrubber( 'guards', GUARD_STEPS.length, ( i ) => {

	worlds.guards.setStep( i );
	setCard( 'guards', i );
	refreshGuards();
	renderGuardsTable();
	guardTrace( i );
	flyTo( worlds.guards.getStepView( i ) );

} );

function guardHeader() {

	proc.clear();
	proc.setTitle( 'guards — ablation' );
	proc.setStatus( 'two runs', 'running' );
	proc.write( 'each switch removes one guard and re-runs the debate under the condition that guard exists for', 'cmd' );
	proc.write( `baseline  λ ${ DEFAULTS.lambda.toFixed( 2 ) } · decay ${ DEFAULTS.decay.toFixed( 2 ) } · ε ${ DEFAULTS.eps.toFixed( 2 ) } · cap ${ DEFAULTS.cap.toFixed( 2 ) }`, 'dim' );
	proc.write( 'this page ignores the other pages\' sliders — an ablation is only readable as a controlled pair', 'dim' );
	proc.rule();

}

function guardTrace( i ) {

	const g = GUARD_STEPS[ i ];
	const key = Object.keys( g.kill )[ 0 ];
	proc.write( `${ i + 1 }. ${ g.title }`, 'head' );
	proc.write( g.formula, 'cmd' );
	proc.write( g.stressLabel, 'warn' );
	proc.write( `guards on   ${ guardRuns.kept.published ? `"${ guardRuns.kept.answer.trim() }" at r${ guardRuns.kept.stoppedAt }` : `withheld after ${ guardRuns.kept.stoppedAt }` }   JSD ${ guardRuns.kept.final.jsd.toFixed( 4 ) }`, 'ok' );
	proc.write( `${ key } off   ${ guardRuns.broken.published ? `"${ guardRuns.broken.answer.trim() }" at r${ guardRuns.broken.stoppedAt }` : `withheld after ${ guardRuns.broken.stoppedAt }` }   JSD ${ guardRuns.broken.final.jsd.toFixed( 4 ) }`, guardRuns.broken.correct ? 'warn' : 'err' );
	const sizes = ( r ) => r.rounds[ 0 ].per.map( ( s ) => s.msg.length ).join( '/' );
	proc.write( `packets r0  ${ sizes( guardRuns.kept ) }  →  ${ sizes( guardRuns.broken ) }`, 'dim' );
	proc.write( guardRuns.broken.correct
		? 'still lands on the right answer here — the guard costs nothing on an easy run and saves the hard ones'
		: 'the council no longer reaches the answer it reaches with every guard in place', guardRuns.broken.correct ? 'note' : 'err' );

}

/* --------------------------------------------------------------- picking */

const detailCard = document.getElementById( 'detail-card' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function openDetail( payload ) {

	if ( ! payload ) return;
	document.getElementById( 'detail-category' ).textContent = payload.category || '';
	document.getElementById( 'detail-name' ).textContent = payload.name || '';
	document.getElementById( 'detail-blurb' ).textContent = payload.blurb || '';
	document.getElementById( 'detail-description' ).textContent = payload.description || '';
	const hasMetric = Boolean( payload.metric );
	document.getElementById( 'detail-metric-block' ).classList.toggle( 'hidden', ! hasMetric );
	if ( hasMetric ) {

		document.getElementById( 'detail-metric-label' ).textContent = payload.metricLabel || 'Value';
		document.getElementById( 'detail-metric' ).textContent = payload.metric;

	}
	detailCard.classList.add( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'false' );

}

function closeDetail() {

	detailCard.classList.remove( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'true' );

}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function visibleChain( object ) {

	let o = object;
	while ( o ) { if ( ! o.visible ) return false; o = o.parent; }
	return true;

}

renderer.domElement.addEventListener( 'pointerdown', ( event ) => {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );

	const hits = raycaster
		.intersectObjects( worlds[ currentKey ].interactables, false )
		.filter( ( h ) => visibleChain( h.object ) );

	if ( ! hits.length ) return;
	openDetail( worlds[ currentKey ].describe( hits[ 0 ].object ) );

} );

/* ------------------------------------------------------------------- nav */

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const SCRUBS = { floor: floorScrub, channel: chanScrub, schedule: schedScrub, consensus: consScrub, guards: guardScrub };
const ENTER = { floor: enterFloor, channel: enterChannel, schedule: enterSchedule, consensus: enterConsensus, guards: enterGuards };

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	Object.values( SCRUBS ).forEach( ( s ) => s.stop() );
	proc.cancel();
	closeDetail();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === key ) );
	worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === key ) );

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;
	setWorldLabelsVisible( key, true );

	ENTER[ key ]();

}

navLinks.forEach( ( btn ) => btn.addEventListener( 'click', () => switchWorld( btn.dataset.goto ) ) );

function enterFloor() {

	worlds.floor.setStep( floorScrub.index );
	setCard( 'floor', floorScrub.index );
	floorHeader();
	floorTrace( floorScrub.index );
	flyTo( worlds.floor.getStepView( floorScrub.index ) );

}

function enterChannel() {

	worlds.channel.setStep( chanScrub.index );
	setCard( 'channel', chanScrub.index );
	channelHeader();
	channelTrace( chanScrub.index );
	flyTo( worlds.channel.getStepView( chanScrub.index ) );

}

function enterSchedule() {

	worlds.schedule.setStep( schedScrub.index );
	setCard( 'schedule', schedScrub.index );
	schedHeader();
	schedTrace( schedScrub.index );
	flyTo( worlds.schedule.getStepView( schedScrub.index ) );

}

function enterConsensus() {

	setRound( consScrub.index );
	worlds.consensus.setRound( roundIndex );
	setCard( 'consensus', consScrub.index );
	consHeader();
	consTrace( consScrub.index );
	flyTo( worlds.consensus.getStepView( consScrub.index ) );

}

function enterGuards() {

	worlds.guards.setStep( guardScrub.index );
	setCard( 'guards', guardScrub.index );
	refreshGuards();
	renderGuardsTable();
	guardHeader();
	guardTrace( guardScrub.index );
	flyTo( worlds.guards.getStepView( guardScrub.index ) );

}

function syncChips() {

	document.querySelectorAll( '#topology-chips .chip, #topology-chips-2 .chip' )
		.forEach( ( c ) => c.classList.toggle( 'active', c.dataset.topology === params.topology ) );
	document.querySelectorAll( '#mode-chips .chip' )
		.forEach( ( c ) => c.classList.toggle( 'active', c.dataset.mode === params.mode ) );

}

/* ----------------------------------------------------------------- start */

syncChips();
recompute();

[ 'floor', 'channel', 'schedule', 'consensus', 'guards' ].forEach( ( key ) => {

	worlds[ key ].setStep( 0 );
	setCard( key, 0 );
	setWorldLabelsVisible( key, key === 'floor' );

} );

navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === 'floor' ) );
worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === 'floor' ) );
enterFloor();

setTimeout( () => document.getElementById( 'loading' ).classList.add( 'hidden' ), 700 );

const clock = new THREE.Clock();

renderer.setAnimationLoop( () => {

	const dt = Math.min( 0.05, clock.getDelta() );
	updateTweens( dt );
	worlds[ currentKey ].update( dt );
	controls.update();
	renderPipeline.render();
	labelRenderer.render( worlds[ currentKey ].scene, camera );

} );
