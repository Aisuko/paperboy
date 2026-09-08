import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput, buildEnvironment } from './utils/renderKit.js';
import { enableShadows } from './utils/sceneKit.js';
import { enterWorld } from './utils/choreo.js';
import { num } from '../../../js/theme.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildHeadWorld } from './worlds/head.js';
import { buildProjectionWorld } from './worlds/projection.js';
import { buildSoftmaxWorld } from './worlds/softmax.js';
import { buildDimsWorld } from './worlds/dims.js';

import { HEAD_STEPS, PROJ_STEPS, SOFT_STEPS, DIMS_STEPS } from './data/copy.js';
import {
	VOCAB, PROMPT, D_MODEL, VOCAB_SIZE, MODELS,
	entropy, topK, argmax, headParams, fmtCount, fmtPct, weight,
} from './data/lmhead.js';

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
if ( num( '--stage-shadow-gain', 0 ) > 0 ) {

	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

}
container.appendChild( renderer.domElement );

// The WebGPU PMREMGenerator (used for the environment map below) throws if
// the backend has not been initialised yet, so wait for it here.
await renderer.init();

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const BASE_FOV = 28;
const DESIGN_ASPECT = 16 / 9;
const FRAME_MARGIN = 1.12;

const camera = new THREE.PerspectiveCamera( BASE_FOV, 1, 0.1, 400 );
camera.position.set( 1.8, 3.2, 31 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.62;

const renderPipeline = createRenderPipeline( renderer );

// The step views are framed for a wide viewport. On anything narrower the
// horizontal extent gets clipped, so widen the vertical FOV to keep the same
// horizontal coverage — the scene stays centred on controls.target either way.
function frameCamera( w, h ) {

	const aspect = w / h;
	const fit = aspect < DESIGN_ASPECT ? DESIGN_ASPECT / aspect : 1;
	const halfTan = Math.tan( THREE.MathUtils.degToRad( BASE_FOV ) * 0.5 ) * FRAME_MARGIN * fit;
	camera.fov = Math.min( 60, THREE.MathUtils.radToDeg( 2 * Math.atan( halfTan ) ) );
	camera.updateProjectionMatrix();

}

bindViewport( viewport, camera, [ renderer, labelRenderer ], frameCamera );

const worlds = {
	head: buildHeadWorld(),
	projection: buildProjectionWorld(),
	softmax: buildSoftmaxWorld(),
	dims: buildDimsWorld(),
};

const STEPS = { head: HEAD_STEPS, projection: PROJ_STEPS, softmax: SOFT_STEPS, dims: DIMS_STEPS };

// Image-based lighting so the walls and bars have something to reflect.
const envMap = buildEnvironment( renderer );
Object.values( worlds ).forEach( ( world ) => {

	world.scene.environment = envMap;
	world.scene.environmentIntensity = num( '--env-intensity', 0.35 );
	enableShadows( world.scene );

} );

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

const sceneOutputs = {};
// Additive bloom reads as haze on a light stage, so the light theme dials the
// strength down and lifts the threshold — see --bloom-* in css/base.css.
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, {
	strength: 0.24 * num( '--bloom-gain', 1 ),
	radius: 0.6,
	threshold: num( '--bloom-threshold', 0.6 ),
} );

let currentKey = 'head';
renderPipeline.outputNode = sceneOutputs.head;

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

function chipRow( root, items, onPick, activeKey ) {

	root.innerHTML = '';
	items.forEach( ( item ) => {

		const b = document.createElement( 'button' );
		b.className = 'chip' + ( item.key === activeKey ? ' active' : '' );
		b.textContent = item.label;
		b.dataset.key = item.key;
		b.addEventListener( 'click', () => {

			[ ...root.children ].forEach( ( c ) => c.classList.toggle( 'active', c === b ) );
			onPick( item );

		} );
		root.appendChild( b );

	} );

}

// ---------------------------------------------------------------- 01 head

let headPos = PROMPT.length - 1;

chipRow(
	document.getElementById( 'pos-chips' ),
	PROMPT.map( ( w, i ) => ( { key: String( i ), label: `t=${ i } "${ w }"` } ) ),
	( item ) => {

		headPos = parseInt( item.key, 10 );
		const s = worlds.head.setPos( headPos );
		proc.write( `h = hidden state at position ${ headPos } ("${ PROMPT[ headPos ] }")`, 'cmd' );
		proc.write( `top word: "${ VOCAB[ argmax( s.p ) ] }" at ${ ( Math.max( ...s.p ) * 100 ).toFixed( 1 ) }%`, 'calc' );
		renderHeadTable();

	},
	String( headPos ),
);

const headScrub = makeScrubber( 'head', HEAD_STEPS.length, ( i ) => {

	worlds.head.setStep( i );
	setCard( 'head', i );
	headTrace( i );
	flyTo( worlds.head.getStepView( i ) );
	renderHeadTable();

} );

function renderHeadTable() {

	const s = worlds.head.getState();
	const best = argmax( s.p );
	document.getElementById( 'head-table' ).innerHTML = `
		<tbody>
			<tr><td>prompt</td><td class="num">"${ PROMPT.join( ' ' ) }"</td></tr>
			<tr><td>d_model</td><td class="num">${ D_MODEL }</td></tr>
			<tr><td>blocks</td><td class="num">4</td></tr>
			<tr><td>vocab</td><td class="num">${ VOCAB_SIZE }</td></tr>
			<tr><td>head params</td><td class="num">${ D_MODEL } · ${ VOCAB_SIZE } = 96</td></tr>
			<tr class="is-pick"><td class="tag">reading pos</td><td class="num">t = ${ s.pos } "${ PROMPT[ s.pos ] }"</td></tr>
			<tr class="is-pick"><td class="tag">next word</td><td class="num">"${ VOCAB[ best ] }" · ${ ( s.p[ best ] * 100 ).toFixed( 1 ) }%</td></tr>
		</tbody>`;

}

function headHeader() {

	proc.clear();
	proc.setTitle( 'lm head — where it sits' );
	proc.setStatus( 'assembled', 'done' );
	proc.write( `prompt = "${ PROMPT.join( ' ' ) }"`, 'cmd' );
	proc.write( 'tokens (5,) → embed (5, 6) → 4 blocks → h (6,) → head (16,) → softmax', 'out' );
	proc.rule();

}

function headTrace( i ) {

	proc.write( `${ i + 1 }. ${ HEAD_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'backbone: embedding + every transformer block', 'out' );
		proc.write( 'head:     the last linear layer, nothing else', 'out' );
		proc.write( 'the name comes from multi-task learning — one trunk, task heads bolted on', 'note' );

	} else if ( i === 1 ) {

		proc.write( 'x = E[token_ids]', 'cmd' );
		proc.write( `(${ PROMPT.length },) int ids → (${ PROMPT.length }, ${ D_MODEL }) float vectors`, 'calc' );
		proc.write( 'the embedding table E is (16, 6) — remember its shape for page 04', 'dim' );

	} else if ( i === 2 ) {

		proc.write( 'for block in blocks: h = h + block(h)', 'cmd' );
		proc.write( 'attention mixes positions, the MLP mixes features — all the nonlinearity lives here', 'out' );
		proc.write( 'GPT-2 has 12 of these, Llama-3 70B has 80. We drew 4.', 'dim' );

	} else if ( i === 3 ) {

		const s = worlds.head.getState();
		proc.write( `h = ${ '[' + s.h.map( ( v ) => v.toFixed( 2 ) ).join( ', ' ) + ']' }`, 'calc' );
		proc.write( 'six numbers carrying the entire prompt — the head sees nothing else', 'note' );

	} else if ( i === 4 ) {

		proc.write( 'z = h @ W        # (6,) @ (6, 16) → (16,)', 'cmd' );
		proc.write( 'a plain nn.Linear(6, 16, bias=False)', 'out' );
		proc.write( 'page 02 walks through this multiply column by column', 'dim' );

	} else {

		const s = worlds.head.getState();
		const top = topK( s.p, 3 );
		proc.write( 'p = softmax(z)', 'cmd' );
		top.forEach( ( e ) => proc.write( `p("${ e.word }") = ${ ( e.p * 100 ).toFixed( 1 ) }%`, 'calc' ) );
		proc.write( 'a distribution over the whole vocabulary: a language model\'s actual output', 'ok' );

	}

}

// ---------------------------------------------------------------- 02 projection

let projCol = 1;

const colSlider = document.getElementById( 'col-slider' );
const colReadout = document.getElementById( 'col-readout' );

colSlider.addEventListener( 'input', () => {

	projCol = parseInt( colSlider.value, 10 );
	const r = worlds.projection.setColumn( projCol );
	colReadout.textContent = `j=${ projCol } "${ r.word }"`;
	renderProjTable();

} );

colSlider.addEventListener( 'change', () => {

	const s = worlds.projection.getState();
	const terms = s.h.map( ( v, k ) => `${ v.toFixed( 2 ) }·${ weight( k, projCol ).toFixed( 2 ) }` ).join( ' + ' );
	proc.write( `z["${ VOCAB[ projCol ] }"] = ${ terms } = ${ s.z[ projCol ].toFixed( 3 ) }`, 'calc' );

} );

const projScrub = makeScrubber( 'projection', PROJ_STEPS.length, ( i ) => {

	worlds.projection.setStep( i );
	setCard( 'projection', i );
	projTrace( i );
	flyTo( worlds.projection.getStepView( i ) );
	renderProjTable();

} );

function renderProjTable() {

	const s = worlds.projection.getState();
	document.getElementById( 'proj-table' ).innerHTML = `
		<tbody>
			<tr><td>h</td><td class="num">(${ D_MODEL },)</td></tr>
			<tr><td>W</td><td class="num">(${ D_MODEL }, ${ VOCAB_SIZE })</td></tr>
			<tr><td>z</td><td class="num">(${ VOCAB_SIZE },)</td></tr>
			<tr><td>FLOPs</td><td class="num">2 · 6 · 16 = 192</td></tr>
			<tr><td>bias</td><td class="num">none</td></tr>
			<tr class="is-pick"><td class="tag">column</td><td class="num">j=${ s.col } "${ VOCAB[ s.col ] }" → ${ s.z[ s.col ].toFixed( 3 ) }</td></tr>
		</tbody>`;

}

function projHeader() {

	proc.clear();
	proc.setTitle( 'lm head — the projection' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'head = nn.Linear(d_model, vocab, bias=False)', 'cmd' );
	proc.write( 'z = head(h)      # (6,) → (16,)', 'out' );
	proc.rule();

}

function projTrace( i ) {

	proc.write( `${ i + 1 }. ${ PROJ_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'one vector · one matrix · sixteen scores', 'out' );
		proc.write( 'W has one column per word in the vocabulary', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'the blocks already applied every nonlinearity the model has', 'out' );
		proc.write( 'softmax right after the head is nonlinear too — a hidden activation would add nothing', 'out' );
		proc.write( 'linear also keeps the geometry honest: a logit is literally a similarity to a word direction', 'note' );

	} else if ( i === 2 ) {

		const s = worlds.projection.getState();
		proc.write( `z[${ s.col }] = Σ h[k] · W[k][${ s.col }]`, 'cmd' );
		proc.write( `= ${ s.z[ s.col ].toFixed( 3 ) } for "${ VOCAB[ s.col ] }"`, 'calc' );
		proc.write( 'six multiplies and six adds — slide the column picker to walk the vocabulary', 'dim' );

	} else if ( i === 3 ) {

		proc.write( 'z = h @ W        # all 16 columns in one matmul', 'cmd' );
		proc.write( '2 · d · V = 2 · 6 · 16 = 192 FLOPs here', 'calc' );
		proc.write( 'GPT-2: 2 · 768 · 50257 ≈ 77 MFLOPs per token, just for the head', 'out' );

	} else if ( i === 4 ) {

		proc.write( 'softmax(z + c) == softmax(z) for any constant c', 'out' );
		proc.write( 'a per-word bias mostly re-learns word frequency — the embedding already has it', 'dim' );
		proc.write( 'GPT-2 and Llama both ship bias-free heads', 'ok' );

	} else {

		proc.write( 'decode step, batch = 1:', 'cmd' );
		proc.write( 'read  d · V weights   →  emit V logits', 'out' );
		proc.write( 'arithmetic intensity ≈ 2 FLOPs per weight read — memory-bound', 'warn' );
		proc.write( 'see "Arithmetic intensity" on the memory-accounting site for the roofline', 'note' );

	}

}

// ---------------------------------------------------------------- 03 softmax

let temperature = 1;

const tempSlider = document.getElementById( 'temp-slider' );
const tempReadout = document.getElementById( 'temp-readout' );

tempSlider.addEventListener( 'input', () => {

	// slider 0..1 → T on a log scale over [0.25, 4]
	temperature = 0.25 * Math.pow( 16, parseFloat( tempSlider.value ) );
	tempReadout.textContent = `T = ${ temperature.toFixed( 2 ) }`;
	worlds.softmax.setTemperature( temperature );
	renderSoftTable();

} );

tempSlider.addEventListener( 'change', () => {

	const s = worlds.softmax.getState();
	proc.write( `T = ${ temperature.toFixed( 2 ) }   entropy = ${ entropy( s.p ).toFixed( 2 ) } bits   top p = ${ ( Math.max( ...s.p ) * 100 ).toFixed( 1 ) }%`, 'calc' );

} );

chipRow(
	document.getElementById( 'sample-chips' ),
	[ { key: 'greedy', label: 'greedy' }, { key: 'top-k', label: 'top-k (5)' }, { key: 'sample', label: 'sample' } ],
	( item ) => {

		worlds.softmax.setSampling( item.key );
		proc.write( `sampler = ${ item.key }`, 'cmd' );
		renderSoftTable();

	},
	'greedy',
);

document.getElementById( 'sample-btn' ).addEventListener( 'click', () => {

	const r = worlds.softmax.sample();
	proc.write( `sample() → "${ r.word }"   (p = ${ ( r.p * 100 ).toFixed( 1 ) }%)`, 'ok' );
	renderSoftTable();

} );

const softScrub = makeScrubber( 'softmax', SOFT_STEPS.length, ( i ) => {

	worlds.softmax.setStep( i );
	setCard( 'softmax', i );
	softTrace( i );
	flyTo( worlds.softmax.getStepView( i ) );
	renderSoftTable();

} );

function renderSoftTable() {

	const s = worlds.softmax.getState();
	const top = topK( s.p, 5 );
	document.getElementById( 'soft-table' ).innerHTML = `
		<tbody>
			${ top.map( ( e, i ) => `<tr${ i === 0 ? ' class="is-pick"' : '' }><td class="${ i === 0 ? 'tag' : '' }">"${ e.word }"</td><td class="num">${ ( e.p * 100 ).toFixed( 1 ) }%</td></tr>` ).join( '' ) }
			<tr><td>entropy</td><td class="num">${ entropy( s.p ).toFixed( 2 ) } bits</td></tr>
			<tr><td>T</td><td class="num">${ s.T.toFixed( 2 ) }</td></tr>
		</tbody>`;

}

function softHeader() {

	proc.clear();
	proc.setTitle( 'lm head — logits → probabilities' );
	proc.setStatus( 'normalised', 'done' );
	proc.write( 'p = softmax(z / T)', 'cmd' );
	proc.write( 'same 16 logits on every step — only the lens changes', 'dim' );
	proc.rule();

}

function softTrace( i ) {

	proc.write( `${ i + 1 }. ${ SOFT_STEPS[ i ].title }`, 'head' );
	const s = worlds.softmax.getState();

	if ( i === 0 ) {

		proc.write( `z ranges ${ Math.min( ...s.z ).toFixed( 2 ) } … ${ Math.max( ...s.z ).toFixed( 2 ) }`, 'calc' );
		proc.write( 'no ceiling, no floor, no meaning as probabilities yet', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'z′ = z − max(z)', 'cmd' );
		proc.write( 'softmax(z′) == softmax(z), but exp can no longer overflow', 'ok' );

	} else if ( i === 2 ) {

		proc.write( 'exp(z′)', 'cmd' );
		proc.write( 'a 2-logit lead becomes an e² ≈ 7.4× advantage', 'calc' );

	} else if ( i === 3 ) {

		proc.write( 'p = exp(z′) / Σ exp(z′)', 'cmd' );
		proc.write( `Σ p = 1.000   entropy = ${ entropy( s.p ).toFixed( 2 ) } bits`, 'calc' );

	} else if ( i === 4 ) {

		proc.write( 'p = softmax(z / T)', 'cmd' );
		proc.write( 'T → 0: argmax · T = 1: honest · T → ∞: uniform', 'out' );
		proc.write( 'move the slider and watch the bars trade mass', 'dim' );

	} else {

		proc.write( 'the distribution is the model\'s whole answer — picking a word is policy', 'note' );
		proc.write( 'choose a sampler below, then press sample', 'dim' );

	}

}

// ---------------------------------------------------------------- 04 dims

chipRow(
	document.getElementById( 'model-chips' ),
	MODELS.map( ( m ) => ( { key: m.key, label: m.label } ) ),
	( item ) => {

		const m = worlds.dims.setModel( item.key );
		tiedChip.classList.toggle( 'active', m.tied );
		tiedChip.textContent = m.tied ? 'tied to embedding' : 'untied';
		proc.write( `${ m.label }: d=${ m.d } V=${ m.vocab.toLocaleString( 'en-AU' ) } → head ${ fmtCount( headParams( m ) ) } (${ fmtPct( headParams( m ) / m.total ) } of model)`, 'calc' );
		renderDimsTable();

	},
	'gpt2',
);

const tiedChip = document.getElementById( 'tied-chip' );
tiedChip.addEventListener( 'click', () => {

	const s = worlds.dims.getState();
	const t = worlds.dims.setTied( ! s.tied );
	tiedChip.classList.toggle( 'active', t );
	tiedChip.textContent = t ? 'tied to embedding' : 'untied';
	proc.write( t ? 'W = E.T — one matrix stored, gradients flow into it from both ends' : 'W independent — better at scale, twice the storage', t ? 'ok' : 'out' );
	renderDimsTable();

} );

const dimsScrub = makeScrubber( 'dims', DIMS_STEPS.length, ( i ) => {

	worlds.dims.setStep( i );
	setCard( 'dims', i );
	dimsTrace( i );
	flyTo( worlds.dims.getStepView( i ) );
	renderDimsTable();

} );

function renderDimsTable() {

	const s = worlds.dims.getState();
	const m = s.model;
	document.getElementById( 'dims-table' ).innerHTML = `
		<tbody>
			<tr class="is-pick"><td class="tag">model</td><td class="num">${ m.label }</td></tr>
			<tr><td>d_model</td><td class="num">${ m.d.toLocaleString( 'en-AU' ) }</td></tr>
			<tr><td>vocab</td><td class="num">${ m.vocab.toLocaleString( 'en-AU' ) }</td></tr>
			<tr><td>head params</td><td class="num">${ fmtCount( headParams( m ) ) }</td></tr>
			<tr><td>share of model</td><td class="num">${ fmtPct( headParams( m ) / m.total ) }</td></tr>
			<tr><td>tied</td><td class="num">${ s.tied ? 'yes — W = Eᵀ' : 'no' }</td></tr>
		</tbody>`;

}

function dimsHeader() {

	proc.clear();
	proc.setTitle( 'lm head — dimensions' );
	proc.setStatus( 'measured', 'done' );
	proc.write( 'params(head) = d_model × vocab_size', 'cmd' );
	MODELS.filter( ( m ) => m.key !== 'toy' ).forEach( ( m ) =>
		proc.write( `${ m.label.padEnd( 12 ) } ${ String( m.d ).padStart( 5 ) } × ${ m.vocab.toLocaleString( 'en-AU' ).padStart( 7 ) } = ${ fmtCount( headParams( m ) ).padStart( 8 ) }`, 'out' ) );
	proc.rule();

}

function dimsTrace( i ) {

	proc.write( `${ i + 1 }. ${ DIMS_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'toy: 6 × 16 = 96 weights', 'calc' );
		proc.write( 'both axes are chosen before training ever starts — d by the architect, V by the tokeniser', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'frames drawn at log₁₀ scale — linear would not fit on the deck', 'dim' );
		proc.write( 'vocab is the long axis in every model: V ≫ d always', 'out' );

	} else if ( i === 2 ) {

		proc.write( 'GPT-2 124M: 38.6M head = 31% of the model', 'calc' );
		proc.write( 'Llama-3 8B: 525M head = 6.5% — bigger absolute, smaller share', 'calc' );
		proc.write( 'no other single matrix in these models is larger', 'note' );

	} else if ( i === 3 ) {

		proc.write( 'tie:   W = E.T   → store d·V once', 'out' );
		proc.write( 'GPT-2 ties. Llama-3 does not — at scale the two jobs want different geometry.', 'out' );
		proc.write( 'toggle it below and watch the parameter bill', 'dim' );

	} else if ( i === 4 ) {

		proc.write( 'd_model: 768 → 8192   (~11×)', 'calc' );
		proc.write( 'vocab:   50257 → 128256  (~2.6×)', 'calc' );
		proc.write( 'vocab growth buys tokenisation coverage, not capacity', 'dim' );

	} else {

		proc.write( 'lm head    (d, V)  → next-word distribution', 'out' );
		proc.write( 'classifier (d, 2)  → spam / not spam', 'out' );
		proc.write( 'reward     (d, 1)  → one scalar score', 'out' );
		proc.write( 'same backbone under all three — that is the whole meaning of "head"', 'ok' );

	}

}

// ---------------------------------------------------------------- detail card

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

// ---------------------------------------------------------------- picking

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function visibleChain( object ) {

	let o = object;
	while ( o ) { if ( ! o.visible ) return false; o = o.parent; }
	return true;

}

function pickTarget( event ) {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );

	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true )
		.filter( ( h ) => visibleChain( h.object ) && h.object.userData.kind );

	return hits.length ? hits[ 0 ].object : null;

}

renderer.domElement.addEventListener( 'pointerdown', ( event ) => {

	const hit = pickTarget( event );
	if ( ! hit ) return;
	openDetail( worlds[ currentKey ].describe( hit ) );

} );

// Hover glow: the click target under the pointer gets its emissive boosted by
// --hover-boost. Restores are guarded — the worlds repaint cell intensities on
// every step change and sweep tick, and a repaint's value must win.
const HOVER_BOOST = num( '--hover-boost', 1 );
let hoverObj = null;
let hoverSaved = [];

function clearHover() {

	hoverSaved.forEach( ( { material, saved, boosted } ) => {

		if ( Math.abs( material.emissiveIntensity - boosted ) < 1e-6 ) material.emissiveIntensity = saved;

	} );
	hoverSaved = [];
	hoverObj = null;

}

function applyHover( obj ) {

	if ( obj === hoverObj ) return;
	clearHover();
	if ( ! obj ) return;
	hoverObj = obj;

	const mats = Array.isArray( obj.material ) ? obj.material : [ obj.material ];
	mats.forEach( ( m ) => {

		if ( ! m || ! m.emissive || ! m.emissiveIntensity ) return;
		const saved = m.emissiveIntensity;
		const boosted = saved * HOVER_BOOST;
		m.emissiveIntensity = boosted;
		hoverSaved.push( { material: m, saved, boosted } );

	} );

}

renderer.domElement.addEventListener( 'pointermove', ( event ) => {

	const hit = pickTarget( event );
	applyHover( hit );
	renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';

} );

renderer.domElement.addEventListener( 'pointerleave', () => {

	clearHover();
	renderer.domElement.style.cursor = 'grab';

} );

// ---------------------------------------------------------------- world switching

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const ENTER = { head: enterHead, projection: enterProjection, softmax: enterSoftmax, dims: enterDims };

// Opening a page should read as the whole workflow, not a close-up of step 1.
// Once the reader has scrubbed, coming back keeps the view they were on.
function entryView( world, index ) {

	return index === 0 && world.getOverview ? world.getOverview() : world.getStepView( index );

}

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	headScrub.stop();
	projScrub.stop();
	softScrub.stop();
	dimsScrub.stop();
	closeDetail();
	clearHover();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === key ) );
	worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === key ) );

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;
	setWorldLabelsVisible( key, true );
	enterWorld( worlds[ key ].scene );

	ENTER[ key ]();

}

navLinks.forEach( ( btn ) => btn.addEventListener( 'click', () => switchWorld( btn.dataset.goto ) ) );

function enterHead() {

	worlds.head.setStep( headScrub.index );
	headHeader();
	headTrace( headScrub.index );
	setCard( 'head', headScrub.index );
	renderHeadTable();
	flyTo( entryView( worlds.head, headScrub.index ) );

}

function enterProjection() {

	worlds.projection.setStep( projScrub.index );
	projHeader();
	projTrace( projScrub.index );
	setCard( 'projection', projScrub.index );
	renderProjTable();
	flyTo( worlds.projection.getStepView( projScrub.index ) );

}

function enterSoftmax() {

	worlds.softmax.setStep( softScrub.index );
	softHeader();
	softTrace( softScrub.index );
	setCard( 'softmax', softScrub.index );
	renderSoftTable();
	flyTo( worlds.softmax.getStepView( softScrub.index ) );

}

function enterDims() {

	worlds.dims.setStep( dimsScrub.index );
	dimsHeader();
	dimsTrace( dimsScrub.index );
	setCard( 'dims', dimsScrub.index );
	renderDimsTable();
	flyTo( entryView( worlds.dims, dimsScrub.index ) );

}

// ---------------------------------------------------------------- start

worlds.head.setStep( 0 );
worlds.projection.setStep( 0 );
worlds.softmax.setStep( 0 );
worlds.dims.setStep( 0 );
worlds.projection.setColumn( projCol );
setCard( 'projection', 0 );
setCard( 'softmax', 0 );
setCard( 'dims', 0 );
renderProjTable();
renderSoftTable();
renderDimsTable();
tempReadout.textContent = 'T = 1.00';

navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === 'head' ) );
worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === 'head' ) );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'head' ) );
enterWorld( worlds.head.scene );
enterHead();

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
