import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildOverviewWorld } from './worlds/overview.js';
import { buildInputWorld } from './worlds/input.js';
import { buildCouncilWorld } from './worlds/council.js';
import { buildAggregationWorld } from './worlds/aggregation.js';
import { buildOutputWorld } from './worlds/output.js';
import { buildCompareWorld } from './worlds/compare.js';

import { AGGREGATION_STEPS } from './data/aggregationSteps.js';
import { ZONES } from './data/zones.js';
import { TELEMETRY_FEATURES, EMBEDDING_DIM, NOMINAL_CAPACITY, jitterValue } from './data/telemetry.js';
import { SOH_AGENTS, RUL_AGENTS, DISAGREEMENT_THRESHOLD, assess } from './data/council.js';

// ---------------------------------------------------------------- renderer

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

// A long lens keeps the pipeline reading like a schematic rather than a photo.
const camera = new THREE.PerspectiveCamera( 28, 1, 0.1, 400 );
camera.position.set( -0.9, 4.6, 28.0 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.54;
controls.target.set( 0, 0, 0 );

const renderPipeline = createRenderPipeline( renderer );

bindViewport( viewport, camera, [ renderer, labelRenderer ] );

// ---------------------------------------------------------------- worlds

const worlds = {
	overview: buildOverviewWorld(),
	input: buildInputWorld(),
	council: buildCouncilWorld(),
	aggregation: buildAggregationWorld(),
	output: buildOutputWorld(),
	compare: buildCompareWorld(),
};

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.24, radius: 0.6, threshold: 0.6 } );

let currentKey = 'overview';
renderPipeline.outputNode = sceneOutputs.overview;

function setScene( key ) {

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;

}

function flyCameraTo( view, duration = 1.0 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

// ---------------------------------------------------------------- console

const proc = new ProcessConsole( document.getElementById( 'console' ) );
const RESULT = assess();

function hex( value ) {

	return '#' + value.toString( 16 ).padStart( 6, '0' );

}

// ---------------------------------------------------------------- nav

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setActiveNav( key ) {

	navLinks.forEach( ( btn ) => btn.classList.toggle( 'active', btn.dataset.goto === key ) );
	worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === key ) );

}

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const ENTER = {
	overview: enterOverview,
	input: enterInput,
	council: enterCouncil,
	aggregation: enterAggregation,
	output: enterOutput,
	compare: enterCompare,
};

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	stopAggAutoplay();
	proc.cancel();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	setActiveNav( key );
	setScene( key );
	setWorldLabelsVisible( key, true );
	closeDetail();

	ENTER[ key ]();

}

navLinks.forEach( ( btn ) => btn.addEventListener( 'click', () => switchWorld( btn.dataset.goto ) ) );

// ---------------------------------------------------------------- detail card

const detailCard = document.getElementById( 'detail-card' );
const detailCategory = document.getElementById( 'detail-category' );
const detailName = document.getElementById( 'detail-name' );
const detailBlurb = document.getElementById( 'detail-blurb' );
const detailDescription = document.getElementById( 'detail-description' );
const detailMetricBlock = document.getElementById( 'detail-metric-block' );
const detailMetricLabel = document.getElementById( 'detail-metric-label' );
const detailMetric = document.getElementById( 'detail-metric' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function openDetail( payload ) {

	detailCategory.textContent = payload.category || '';
	detailCategory.style.color = payload.color ? hex( payload.color ) : '';
	detailName.textContent = payload.name || '';
	detailBlurb.textContent = payload.blurb || '';
	detailDescription.textContent = payload.description || '';

	const hasMetric = Boolean( payload.metric );
	detailMetricBlock.classList.toggle( 'hidden', ! hasMetric );
	if ( hasMetric ) {

		detailMetricLabel.textContent = payload.metricLabel || 'Estimate';
		detailMetric.textContent = payload.metric;

	}

	detailCard.classList.add( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'false' );

}

function closeDetail() {

	detailCard.classList.remove( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'true' );

}

// ---------------------------------------------------------------- picking

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickObject( event ) {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );
	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true );
	return hits.length ? hits[ 0 ].object : null;

}

renderer.domElement.addEventListener( 'pointermove', ( event ) => {

	renderer.domElement.style.cursor = pickObject( event ) ? 'pointer' : 'grab';

} );

renderer.domElement.addEventListener( 'click', ( event ) => {

	const hit = pickObject( event );
	if ( ! hit ) { closeDetail(); return; }

	if ( currentKey === 'aggregation' ) {

		let node = hit;
		while ( node && node.userData.stepIndex === undefined ) node = node.parent;
		if ( node ) { stopAggAutoplay(); goToAggStep( node.userData.stepIndex ); }

	}

	let detailNode = hit;
	while ( detailNode && ! detailNode.userData.detail ) detailNode = detailNode.parent;
	if ( detailNode ) openDetail( detailNode.userData.detail );

} );

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

// ---------------------------------------------------------------- 01 overview

const legendEl = document.getElementById( 'overview-legend' );
ZONES.forEach( ( zone ) => {

	const row = document.createElement( 'div' );
	row.className = 'legend-item';
	row.innerHTML = `<span class="legend-dot" style="background:${ hex( zone.color ) }"></span>${ zone.index } · ${ zone.label }`;
	legendEl.appendChild( row );

} );

function enterOverview() {

	proc.clear();
	proc.setTitle( 'estimation run — pipeline' );
	proc.setStatus( 'ready', 'done' );
	proc.write( 'orchestra --describe', 'cmd' );
	ZONES.forEach( ( zone ) => {

		proc.write( `${ zone.index }  ${ zone.label }`, 'head' );
		proc.write( zone.blurb, 'out' );

	} );
	proc.rule();
	proc.write( `${ SOH_AGENTS.length + RUL_AGENTS.length } agents · 2 derived modules · one number out the far end.`, 'note' );

	flyCameraTo( worlds.overview.defaultView, 1.0 );

}

// ---------------------------------------------------------------- 02 input

function logSample() {

	proc.write( 'read_pack()', 'cmd' );
	TELEMETRY_FEATURES.forEach( ( f ) => {

		proc.write( `${ f.label.padEnd( 20 ) } ${ jitterValue( f ) }`, 'out' );

	} );

	const ratio = ( TELEMETRY_FEATURES.find( ( f ) => f.key === 'capacity' ).base / NOMINAL_CAPACITY ) * 100;
	proc.write( `capacity ratio       ${ ratio.toFixed( 1 ) }% of ${ NOMINAL_CAPACITY } Ah nominal`, 'calc' );
	proc.write( `encoder projection   ${ TELEMETRY_FEATURES.length } → ${ EMBEDDING_DIM } dims`, 'dim' );

}

function enterInput() {

	proc.clear();
	proc.setTitle( 'estimation run — input' );
	proc.setStatus( 'streaming', 'running' );
	logSample();
	proc.rule();
	proc.write( 'Capacity ratio alone is a crude health estimate. The council exists because resistance growth and dQ/dV peaks tell a different story from the same pack.', 'note' );

	flyCameraTo( worlds.input.defaultView, 1.0 );

}

document.getElementById( 'input-sample' ).addEventListener( 'click', logSample );

// ---------------------------------------------------------------- 03 council

function renderCouncilTable() {

	const rows = [
		...SOH_AGENTS.map( ( a, i ) => ( { a, weight: RESULT.soh.weights[ i ], kind: 'soh' } ) ),
		...RUL_AGENTS.map( ( a, i ) => ( { a, weight: RESULT.rul.weights[ i ], kind: 'rul' } ) ),
	].map( ( { a, weight, kind } ) => `
		<tr class="is-${ kind }">
			<td class="name">${ a.name.replace( ' Agent', '' ) }</td>
			<td class="num">${ a.estimate }${ a.unit }</td>
			<td class="num">± ${ a.sigma }</td>
			<td class="num">${ ( weight * 100 ).toFixed( 0 ) }%</td>
		</tr>` ).join( '' );

	document.getElementById( 'council-table' ).innerHTML = `
		<thead><tr><th>Agent</th><th class="num">Estimate</th><th class="num">σ</th><th class="num">Weight</th></tr></thead>
		<tbody>${ rows }</tbody>
		<tfoot>
			<tr><td>Consensus</td><td class="num">${ RESULT.soh.value.toFixed( 2 ) }%</td><td class="num">± ${ RESULT.soh.sigma.toFixed( 2 ) }</td><td class="num"></td></tr>
			<tr><td></td><td class="num">${ Math.round( RESULT.rul.value ) } cyc</td><td class="num">± ${ Math.round( RESULT.rul.sigma ) }</td><td class="num"></td></tr>
		</tfoot>`;

}

renderCouncilTable();

function enterCouncil() {

	proc.clear();
	proc.setTitle( 'estimation run — council' );
	proc.setStatus( 'voting', 'running' );
	proc.write( 'council.collect()', 'cmd' );

	proc.write( 'state of health', 'head' );
	SOH_AGENTS.forEach( ( a, i ) => {

		proc.write( `${ a.name.padEnd( 14 ) } ${ a.estimate.toFixed( 1 ) }%  σ ${ a.sigma.toFixed( 1 ) }  w ${ ( RESULT.soh.weights[ i ] * 100 ).toFixed( 1 ) }%`, 'out' );

	} );

	proc.write( 'remaining useful life', 'head' );
	RUL_AGENTS.forEach( ( a, i ) => {

		proc.write( `${ a.name.padEnd( 14 ) } ${ a.estimate } cyc  σ ${ a.sigma }  w ${ ( RESULT.rul.weights[ i ] * 100 ).toFixed( 1 ) }%`, 'out' );

	} );

	proc.rule();
	proc.write( 'Weights are 1/σ² renormalised — a confident agent pulls harder. No agent is told what the others said.', 'note' );

	flyCameraTo( worlds.council.defaultView, 1.0 );

}

// ---------------------------------------------------------------- 04 aggregation

const aggTrack = document.getElementById( 'agg-track' );
const aggStepNum = document.getElementById( 'agg-step-num' );
const aggStepTotal = document.getElementById( 'agg-step-total' );
const aggStepTitle = document.getElementById( 'agg-step-title' );
const aggStepDesc = document.getElementById( 'agg-step-desc' );
const aggPlay = document.getElementById( 'agg-play' );

let aggIndex = 0;
let aggAutoplayTimer = null;

aggStepTotal.textContent = String( AGGREGATION_STEPS.length );

// The console trace for each aggregation step, built from the live numbers.
const AGG_TRACE = [
	() => [
		{ text: 'votes collected', kind: 'head' },
		...SOH_AGENTS.map( ( a ) => ( { text: `SOH  ${ a.estimate.toFixed( 1 ) }%  σ ${ a.sigma.toFixed( 1 ) }`, kind: 'out' } ) ),
		...RUL_AGENTS.map( ( a ) => ( { text: `RUL  ${ a.estimate } cyc  σ ${ a.sigma }`, kind: 'out' } ) ),
	],
	() => [
		{ text: 'w = (1/σ²) / Σ(1/σ²)', kind: 'head' },
		...SOH_AGENTS.map( ( a, i ) => ( { text: `SOH  1/${ a.sigma }² = ${ ( 1 / a.sigma ** 2 ).toFixed( 4 ) }  →  w ${ ( RESULT.soh.weights[ i ] * 100 ).toFixed( 1 ) }%`, kind: 'calc' } ) ),
		{ text: `weighted mean  SOH ${ RESULT.soh.value.toFixed( 4 ) }%`, kind: 'ok' },
		{ text: `weighted mean  RUL ${ RESULT.rul.value.toFixed( 2 ) } cyc`, kind: 'ok' },
	],
	() => [
		{ text: 'disagreement', kind: 'head' },
		{ text: `SOH  sd ${ RESULT.soh.spread.toFixed( 4 ) }  →  ${ ( RESULT.soh.relativeSpread * 100 ).toFixed( 2 ) }% of the consensus`, kind: 'calc' },
		{ text: `RUL  sd ${ RESULT.rul.spread.toFixed( 2 ) }  →  ${ ( RESULT.rul.relativeSpread * 100 ).toFixed( 2 ) }% of the consensus`, kind: 'calc' },
		{ text: `τ = ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }%`, kind: 'dim' },
		{
			text: RESULT.converged ? 'both under τ → finalise' : 'over τ → reweight and repeat',
			kind: RESULT.converged ? 'ok' : 'warn',
		},
	],
	() => [
		{ text: 'unified estimate', kind: 'head' },
		{ text: `SOH   ${ RESULT.soh.value.toFixed( 2 ) } ± ${ RESULT.soh.sigma.toFixed( 2 ) } %`, kind: 'ok' },
		{ text: `RUL   ${ Math.round( RESULT.rul.value ) } ± ${ Math.round( RESULT.rul.sigma ) } cycles`, kind: 'ok' },
		{ text: `risk  ${ RESULT.risk.label } (${ RESULT.risk.index.toFixed( 1 ) } / 100)`, kind: 'ok' },
		{ text: `σ = √(1 / Σ 1/σᵢ²) — tighter than any single agent's ${ Math.min( ...SOH_AGENTS.map( ( a ) => a.sigma ) ).toFixed( 1 ) }`, kind: 'note' },
	],
];

function buildAggTrack() {

	aggTrack.innerHTML = '';
	AGGREGATION_STEPS.forEach( ( step, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = step.title;
		node.addEventListener( 'click', () => { stopAggAutoplay(); goToAggStep( i ); } );
		aggTrack.appendChild( node );

	} );

}

function updateAggUI() {

	const step = AGGREGATION_STEPS[ aggIndex ];
	aggStepNum.textContent = String( aggIndex + 1 );
	aggStepTitle.textContent = step.title;
	aggStepDesc.textContent = step.description;

	[ ...aggTrack.children ].forEach( ( node, i ) => {

		node.classList.toggle( 'active', i === aggIndex );
		node.classList.toggle( 'done', i < aggIndex );

	} );

}

function printAggTraceTo( index ) {

	proc.clear();
	for ( let i = 0; i <= index; i ++ ) proc.writeAll( AGG_TRACE[ i ]() );

}

function goToAggStep( index, { append = false } = {} ) {

	const next = Math.max( 0, Math.min( AGGREGATION_STEPS.length - 1, index ) );
	const forwardOne = append && next === aggIndex + 1;
	aggIndex = next;

	worlds.aggregation.goToStep( aggIndex );
	updateAggUI();

	if ( forwardOne ) proc.writeAll( AGG_TRACE[ aggIndex ]() );
	else printAggTraceTo( aggIndex );

	proc.setStatus( `step ${ aggIndex + 1 }/${ AGGREGATION_STEPS.length }`, aggIndex === AGGREGATION_STEPS.length - 1 ? 'done' : 'running' );
	flyCameraTo( worlds.aggregation.getStepView( aggIndex ), 0.85 );

}

function stopAggAutoplay() {

	if ( aggAutoplayTimer ) { clearInterval( aggAutoplayTimer ); aggAutoplayTimer = null; aggPlay.innerHTML = PLAY_ICON; }

}

document.getElementById( 'agg-prev' ).addEventListener( 'click', () => { stopAggAutoplay(); goToAggStep( aggIndex - 1 ); } );
document.getElementById( 'agg-next' ).addEventListener( 'click', () => { stopAggAutoplay(); goToAggStep( aggIndex + 1, { append: true } ); } );
aggPlay.addEventListener( 'click', () => {

	if ( aggAutoplayTimer ) { stopAggAutoplay(); return; }
	if ( aggIndex >= AGGREGATION_STEPS.length - 1 ) goToAggStep( 0 );

	aggPlay.innerHTML = PAUSE_ICON;
	aggAutoplayTimer = setInterval( () => {

		if ( aggIndex >= AGGREGATION_STEPS.length - 1 ) { stopAggAutoplay(); return; }
		goToAggStep( aggIndex + 1, { append: true } );

	}, 3000 );

} );

buildAggTrack();
updateAggUI();

function enterAggregation() {

	proc.setTitle( 'estimation run — aggregation' );
	aggIndex = 0;
	worlds.aggregation.goToStep( 0 );
	updateAggUI();
	printAggTraceTo( 0 );
	proc.setStatus( `step 1/${ AGGREGATION_STEPS.length }`, 'running' );
	flyCameraTo( worlds.aggregation.getStepView( 0 ), 1.0 );

}

// ---------------------------------------------------------------- 05 output

document.getElementById( 'output-table' ).innerHTML = `
	<thead><tr><th>Quantity</th><th class="num">Value</th><th class="num">σ</th></tr></thead>
	<tbody>
		<tr><td class="name">State of health</td><td class="num value">${ RESULT.soh.value.toFixed( 2 ) }%</td><td class="num">± ${ RESULT.soh.sigma.toFixed( 2 ) }</td></tr>
		<tr><td class="name">Remaining useful life</td><td class="num value">${ Math.round( RESULT.rul.value ) } cyc</td><td class="num">± ${ Math.round( RESULT.rul.sigma ) }</td></tr>
		<tr class="is-risk"><td class="name">Degradation risk</td><td class="num value">${ RESULT.risk.label }</td><td class="num">${ RESULT.risk.index.toFixed( 0 ) }/100</td></tr>
	</tbody>`;

function enterOutput() {

	worlds.output.reset();

	proc.clear();
	proc.setTitle( 'estimation run — output' );
	proc.setStatus( 'published', 'done' );
	proc.write( 'orchestra.publish()', 'cmd' );
	proc.write( `SOH   ${ RESULT.soh.value.toFixed( 2 ) } ± ${ RESULT.soh.sigma.toFixed( 2 ) } %`, 'ok' );
	proc.write( `RUL   ${ Math.round( RESULT.rul.value ) } ± ${ Math.round( RESULT.rul.sigma ) } cycles`, 'ok' );
	proc.write( `risk  ${ RESULT.risk.label } · index ${ RESULT.risk.index.toFixed( 1 ) } / 100`, 'ok' );
	proc.rule();
	proc.write( 'risk index = 0.5·(100 − SOH)·2 + 0.5·(400 − RUL)/400·100', 'calc' );
	proc.write( 'Risk and uncertainty are derived from the two consensus numbers, not estimated separately. Move either and the band moves with it.', 'note' );

	flyCameraTo( worlds.output.defaultView, 1.0 );

}

document.getElementById( 'output-replay' ).addEventListener( 'click', enterOutput );

// ---------------------------------------------------------------- 06 compare

const compareNote = document.getElementById( 'compare-note' );

function enterCompare() {

	worlds.compare.reset();
	compareNote.classList.remove( 'is-live' );
	compareNote.textContent = 'Corrupt an agent\'s sensor from the console and watch both columns react.';

	proc.clear();
	proc.setTitle( 'estimation run — fault response' );
	proc.setStatus( 'nominal', 'done' );
	proc.write( 'Two systems, one bad capacity sensor', 'head' );
	proc.write( 'single estimator   no second opinion, no way to notice', 'dim' );
	proc.write( 'agent council      disagreement is measurable, so the outlier can be rejected', 'dim' );
	proc.rule();
	proc.write( `baseline consensus  ${ worlds.compare.baseline.soh.value.toFixed( 2 ) } ± ${ worlds.compare.baseline.soh.sigma.toFixed( 2 ) } %`, 'out' );
	proc.write( 'Run the fault injection below.', 'note' );

	flyCameraTo( worlds.compare.defaultView, 1.0 );

}

document.getElementById( 'compare-drift-btn' ).addEventListener( 'click', ( event ) => {

	const btn = event.currentTarget;
	btn.disabled = true;
	compareNote.classList.add( 'is-live' );

	proc.write( 'inject-fault --agent soh-1 --capacity-sensor drift', 'cmd' );
	proc.setStatus( 'fault injected', 'error' );

	const { baseline, naive, recovered } = worlds.compare;
	let phase = 0;

	worlds.compare.triggerDrift( ( text ) => {

		compareNote.textContent = text;

		if ( phase === 0 ) {

			proc.write( `single estimator  ${ baseline.soh.value.toFixed( 1 ) }% → 61.6%  (wrong, and unaware)`, 'err' );

		} else if ( phase === 1 ) {

			proc.write( `council, naive weighting  ${ naive.value.toFixed( 2 ) }%  — the outlier had ${ ( 100 * 0.48 ).toFixed( 0 ) }% of the weight`, 'warn' );
			proc.write( `disagreement  ${ ( naive.relativeSpread * 100 ).toFixed( 1 ) }%  vs τ ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }%`, 'warn' );

		} else if ( phase === 2 ) {

			proc.write( `reweight → reject ${ recovered.rejected.map( ( a ) => a.name ).join( ', ' ) }`, 'ok' );
			proc.write( `council recovered  ${ recovered.value.toFixed( 2 ) } ± ${ recovered.sigma.toFixed( 2 ) } %`, 'ok' );
			proc.write( 'The error bar is wider than before — two agents instead of three. The council reports that too.', 'note' );
			proc.setStatus( 'recovered', 'done' );
			btn.disabled = false;

		}

		phase ++;

	} );

} );

// ---------------------------------------------------------------- start

setActiveNav( 'overview' );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'overview' ) );
enterOverview();

const loadingEl = document.getElementById( 'loading' );
setTimeout( () => loadingEl.classList.add( 'hidden' ), 700 );

// ---------------------------------------------------------------- render loop

const clock = new THREE.Clock();

renderer.setAnimationLoop( () => {

	const dt = Math.min( 0.05, clock.getDelta() );

	updateTweens( dt );
	worlds[ currentKey ].update( dt );
	controls.update();

	renderPipeline.render();
	labelRenderer.render( worlds[ currentKey ].scene, camera );

} );
