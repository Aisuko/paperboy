import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildTokenizeWorld } from './worlds/tokenize.js';
import { buildBlockWorld } from './worlds/block.js';
import { buildAttentionWorld } from './worlds/attention.js';
import { buildOutputWorld } from './worlds/output.js';
import { buildTrainWorld } from './worlds/train.js';
import { buildGlossaryWorld } from './worlds/glossary.js';

import { GPT2, formatVector } from './data/gpt2.js';
import { INPUT_TEXT, TOKENS, FINAL_HIDDEN_STATE } from './data/tokens.js';
import { BLOCK_STAGES, BLOCK_SUMMARY } from './data/blockStages.js';
import { ATTENTION_STEPS, HEAD_COUNT, HEAD_MATRICES, KV_CACHE_NOTE } from './data/attentionSteps.js';
import { CANDIDATES, VOCAB_SIZE, DEFAULTS, SCORE_TABLE } from './data/vocab.js';

// ---------------------------------------------------------------- renderer

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

// A long lens (narrow FOV) keeps the pipeline pages reading like technical
// drawings rather than perspective photographs.
const camera = new THREE.PerspectiveCamera( 28, 1, 0.1, 400 );
camera.position.set( 0.8, 1.8, 14.4 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.58;
controls.target.set( 0, 0, 0 );

const renderPipeline = createRenderPipeline( renderer );

bindViewport( viewport, camera, [ renderer, labelRenderer ] );

// ---------------------------------------------------------------- worlds

const worlds = {
	tokenize: buildTokenizeWorld(),
	block: buildBlockWorld(),
	attention: buildAttentionWorld(),
	output: buildOutputWorld(),
	train: buildTrainWorld(),
	glossary: buildGlossaryWorld(),
};

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.24, radius: 0.6, threshold: 0.6 } );

let currentKey = 'tokenize';
renderPipeline.outputNode = sceneOutputs.tokenize;

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
	tokenize: enterTokenize,
	block: enterBlock,
	attention: enterAttention,
	output: enterOutput,
	train: enterTrain,
	glossary: enterGlossary,
};

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	stopBlockAutoplay();
	stopAttnAutoplay();
	stopOutAutoplay();
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
	detailName.textContent = payload.name || '';
	detailBlurb.textContent = payload.blurb || '';
	detailDescription.textContent = payload.description || '';

	const hasMetric = Boolean( payload.metric );
	detailMetricBlock.classList.toggle( 'hidden', ! hasMetric );
	if ( hasMetric ) {

		detailMetricLabel.textContent = payload.metricLabel || 'Value';
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

	if ( currentKey === 'block' ) {

		let node = hit;
		while ( node && node.userData.stepIndex === undefined ) node = node.parent;
		if ( node ) { stopBlockAutoplay(); goToBlockStep( node.userData.stepIndex ); }

	}

	let detailNode = hit;
	while ( detailNode && ! detailNode.userData.detail ) detailNode = detailNode.parent;
	if ( detailNode ) openDetail( detailNode.userData.detail );

} );

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

function buildTrack( trackEl, items, onClick ) {

	trackEl.innerHTML = '';
	items.forEach( ( item, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = item.title;
		node.addEventListener( 'click', () => onClick( i ) );
		trackEl.appendChild( node );

	} );

}

function paintTrack( trackEl, index ) {

	[ ...trackEl.children ].forEach( ( node, i ) => {

		node.classList.toggle( 'active', i === index );
		node.classList.toggle( 'done', i < index );

	} );

}

// ---------------------------------------------------------------- 01 tokenise

const tokenizeChipsEl = document.getElementById( 'tokenize-chips' );
const TOKENIZE_STAGES = [ '1. Tokens', '2. Embeddings', '3. Neighbours' ];

TOKENIZE_STAGES.forEach( ( label, i ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( i === 0 ? ' active' : '' );
	chip.textContent = label;
	chip.addEventListener( 'click', () => {

		tokenizeChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.tokenize.showStage( i );
		logTokenizeStage( i );

	} );
	tokenizeChipsEl.appendChild( chip );

} );

function logTokenizeStage( index ) {

	if ( index === 0 ) {

		proc.write( 'tokens', 'head' );
		TOKENS.forEach( ( t ) => proc.write( `${ String( t.position ).padEnd( 3 ) } ${ t.display.padEnd( 10 ) } id ${ t.id }`, 'out' ) );

	} else if ( index === 1 ) {

		proc.write( 'embeddings', 'head' );
		proc.write( `wte[id] + wpe[pos]  →  [1, ${ TOKENS.length }, ${ GPT2.dModel }]`, 'calc' );
		TOKENS.forEach( ( t ) => {

			proc.write( `${ t.display.padEnd( 10 ) } ${ formatVector( t.embedding, { decimals: 2, max: 4, dims: GPT2.dModel } ) }`, 'out' );

		} );

	} else {

		proc.write( 'nearest neighbours', 'head' );
		proc.write( 'cosine similarity in the projected space — tokens that appear in similar contexts end up pointing in similar directions.', 'note' );

	}

}

function enterTokenize() {

	proc.clear();
	proc.setTitle( 'forward pass — tokenise' );
	proc.setStatus( 'ready', 'done' );
	proc.write( `model.encode("${ INPUT_TEXT }")`, 'cmd' );
	proc.write( `${ GPT2.name } · ${ GPT2.parameters } params · vocab ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) } · d_model ${ GPT2.dModel }`, 'dim' );
	proc.rule();
	logTokenizeStage( 0 );
	proc.rule();
	proc.write( 'A leading space is part of the token: " weather" and "weather" are different IDs.', 'note' );
	flyCameraTo( worlds.tokenize.defaultView, 1.0 );

}

// ---------------------------------------------------------------- 02 block

const blockTrack = document.getElementById( 'block-track' );
const blockStepNum = document.getElementById( 'block-step-num' );
const blockStepTotal = document.getElementById( 'block-step-total' );
const blockStepTitle = document.getElementById( 'block-step-title' );
const blockStepDesc = document.getElementById( 'block-step-desc' );
const blockStepFormula = document.getElementById( 'block-step-formula' );
const blockPlay = document.getElementById( 'block-play' );

let blockIndex = 0;
let blockAutoplayTimer = null;

blockStepTotal.textContent = String( BLOCK_STAGES.length );

function updateBlockUI() {

	const stage = BLOCK_STAGES[ blockIndex ];
	blockStepNum.textContent = String( blockIndex + 1 );
	blockStepTitle.textContent = stage.title;
	blockStepDesc.textContent = stage.description;
	blockStepFormula.textContent = stage.formula;
	paintTrack( blockTrack, blockIndex );

}

function goToBlockStep( index, { append = false } = {} ) {

	const next = Math.max( 0, Math.min( BLOCK_STAGES.length - 1, index ) );
	const forwardOne = append && next === blockIndex + 1;
	blockIndex = next;

	worlds.block.goToStep( blockIndex );
	updateBlockUI();

	if ( forwardOne ) {

		proc.write( `${ blockIndex + 1 }. ${ BLOCK_STAGES[ blockIndex ].title }`, 'head' );
		proc.writeAll( BLOCK_STAGES[ blockIndex ].trace );

	} else {

		printBlockTraceTo( blockIndex );

	}

	proc.setStatus( `stage ${ blockIndex + 1 }/${ BLOCK_STAGES.length }`, blockIndex === BLOCK_STAGES.length - 1 ? 'done' : 'running' );
	flyCameraTo( worlds.block.getStepView( blockIndex ), 0.8 );

}

function printBlockTraceTo( index ) {

	proc.clear();
	proc.write( `block 1 of ${ GPT2.nLayer }  ·  ${ BLOCK_SUMMARY.flow }`, 'dim' );
	proc.rule();
	for ( let i = 0; i <= index; i ++ ) {

		proc.write( `${ i + 1 }. ${ BLOCK_STAGES[ i ].title }`, 'head' );
		proc.writeAll( BLOCK_STAGES[ i ].trace );

	}

}

function stopBlockAutoplay() {

	if ( blockAutoplayTimer ) { clearInterval( blockAutoplayTimer ); blockAutoplayTimer = null; blockPlay.innerHTML = PLAY_ICON; }

}

document.getElementById( 'block-prev' ).addEventListener( 'click', () => { stopBlockAutoplay(); goToBlockStep( blockIndex - 1 ); } );
document.getElementById( 'block-next' ).addEventListener( 'click', () => { stopBlockAutoplay(); goToBlockStep( blockIndex + 1, { append: true } ); } );
blockPlay.addEventListener( 'click', () => {

	if ( blockAutoplayTimer ) { stopBlockAutoplay(); return; }
	if ( blockIndex >= BLOCK_STAGES.length - 1 ) goToBlockStep( 0 );

	blockPlay.innerHTML = PAUSE_ICON;
	blockAutoplayTimer = setInterval( () => {

		if ( blockIndex >= BLOCK_STAGES.length - 1 ) { stopBlockAutoplay(); return; }
		goToBlockStep( blockIndex + 1, { append: true } );

	}, 2600 );

} );

buildTrack( blockTrack, BLOCK_STAGES, ( i ) => { stopBlockAutoplay(); goToBlockStep( i ); } );
updateBlockUI();

function enterBlock() {

	proc.setTitle( 'forward pass — decoder block' );
	blockIndex = 0;
	worlds.block.goToStep( 0 );
	updateBlockUI();
	printBlockTraceTo( 0 );
	proc.rule();
	proc.write( BLOCK_SUMMARY.note, 'note' );
	proc.setStatus( `stage 1/${ BLOCK_STAGES.length }`, 'running' );
	flyCameraTo( worlds.block.getStepView( 0 ), 1.0 );

}

// ---------------------------------------------------------------- 03 attention

const attnTrack = document.getElementById( 'attn-track' );
const attnStepNum = document.getElementById( 'attn-step-num' );
const attnStepTotal = document.getElementById( 'attn-step-total' );
const attnStepTitle = document.getElementById( 'attn-step-title' );
const attnStepDesc = document.getElementById( 'attn-step-desc' );
const attnStepEquations = document.getElementById( 'attn-step-equations' );
const attnPlay = document.getElementById( 'attn-play' );
const attnKvPanel = document.getElementById( 'attn-kv-panel' );
const attnKvCopy = document.getElementById( 'attn-kv-copy' );
const attnKvOps = document.getElementById( 'attn-kv-ops' );
const attnKvChipsEl = document.getElementById( 'attn-kv-chips' );
const attnHeadSlider = document.getElementById( 'attn-head-slider' );
const attnHeadReadout = document.getElementById( 'attn-head-readout' );

let attnIndex = 0;
let attnAutoplayTimer = null;
let attnMode = 'naive';

attnStepTotal.textContent = String( ATTENTION_STEPS.length );
attnHeadSlider.max = String( HEAD_COUNT - 1 );
attnKvCopy.textContent = KV_CACHE_NOTE.copy;

function updateAttnUI() {

	const step = ATTENTION_STEPS[ attnIndex ];
	attnStepNum.textContent = String( attnIndex + 1 );
	attnStepTitle.textContent = step.title.replace( /^\d+\.\s*/, '' );
	attnStepDesc.textContent = step.copy;
	attnStepEquations.textContent = step.equations.join( '\n' );
	attnStepEquations.style.display = step.equations.length ? '' : 'none';
	attnKvPanel.classList.toggle( 'is-hidden', attnIndex > 1 && attnIndex !== ATTENTION_STEPS.length - 1 );
	paintTrack( attnTrack, attnIndex );

}

function goToAttnStep( index, { append = false } = {} ) {

	const next = Math.max( 0, Math.min( ATTENTION_STEPS.length - 1, index ) );
	const forwardOne = append && next === attnIndex + 1;
	attnIndex = next;

	worlds.attention.goToStep( attnIndex );
	updateAttnUI();

	if ( forwardOne ) {

		proc.write( ATTENTION_STEPS[ attnIndex ].title, 'head' );
		proc.writeAll( ATTENTION_STEPS[ attnIndex ].trace );

	} else {

		printAttnTraceTo( attnIndex );

	}

	proc.setStatus( `step ${ attnIndex + 1 }/${ ATTENTION_STEPS.length }`, attnIndex === ATTENTION_STEPS.length - 1 ? 'done' : 'running' );
	flyCameraTo( worlds.attention.getStepView( attnIndex ), 0.8 );

}

function printAttnTraceTo( index ) {

	proc.clear();
	proc.write( `head 1 of ${ HEAD_COUNT }  ·  d_k = ${ GPT2.dHead }  ·  ${ TOKENS.length } tokens`, 'dim' );
	proc.rule();
	for ( let i = 0; i <= index; i ++ ) {

		proc.write( ATTENTION_STEPS[ i ].title, 'head' );
		proc.writeAll( ATTENTION_STEPS[ i ].trace );

	}

}

function updateKvReadout() {

	const ops = KV_CACHE_NOTE.opsLabel( TOKENS.length );
	attnKvOps.textContent = attnMode === 'cache'
		? `KV cache: ${ ops.cache } K/V computations for ${ TOKENS.length } tokens.`
		: `Naive recompute: ${ ops.naive } K/V computations for the same ${ TOKENS.length } tokens.`;

}

[ [ 'naive', 'Naive recompute' ], [ 'cache', 'KV cache' ] ].forEach( ( [ mode, label ], i ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( i === 0 ? ' active' : '' );
	chip.textContent = label;
	chip.addEventListener( 'click', () => {

		attnKvChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		attnMode = mode;
		worlds.attention.setComputeMode( mode );
		updateKvReadout();

		const ops = KV_CACHE_NOTE.opsLabel( TOKENS.length );
		proc.write( `compute mode: ${ label.toLowerCase() }`, 'cmd' );
		proc.write( mode === 'cache'
			? `K/V computed once per token → ${ ops.cache } computations`
			: `K/V recomputed for every earlier token → ${ ops.naive } computations`, mode === 'cache' ? 'ok' : 'warn' );

	} );
	attnKvChipsEl.appendChild( chip );

} );

attnHeadSlider.addEventListener( 'input', () => {

	const head = Number( attnHeadSlider.value );
	attnHeadReadout.textContent = `${ head + 1 } / ${ HEAD_COUNT }`;
	worlds.attention.setHead( head );

	// Print the head's own attention row for the last token, so switching heads
	// shows a number changing and not just a colour.
	const row = HEAD_MATRICES[ head ].slice( ( TOKENS.length - 1 ) * TOKENS.length, TOKENS.length * TOKENS.length );
	proc.write( `head ${ head + 1 }: A[${ TOKENS.length - 1 }, :] = [ ${ row.map( ( v ) => v.toFixed( 2 ) ).join( ', ' ) } ]`, 'calc' );

} );

function stopAttnAutoplay() {

	if ( attnAutoplayTimer ) { clearInterval( attnAutoplayTimer ); attnAutoplayTimer = null; attnPlay.innerHTML = PLAY_ICON; }

}

document.getElementById( 'attn-prev' ).addEventListener( 'click', () => { stopAttnAutoplay(); goToAttnStep( attnIndex - 1 ); } );
document.getElementById( 'attn-next' ).addEventListener( 'click', () => { stopAttnAutoplay(); goToAttnStep( attnIndex + 1, { append: true } ); } );
attnPlay.addEventListener( 'click', () => {

	if ( attnAutoplayTimer ) { stopAttnAutoplay(); return; }
	if ( attnIndex >= ATTENTION_STEPS.length - 1 ) goToAttnStep( 0 );

	attnPlay.innerHTML = PAUSE_ICON;
	attnAutoplayTimer = setInterval( () => {

		if ( attnIndex >= ATTENTION_STEPS.length - 1 ) { stopAttnAutoplay(); return; }
		goToAttnStep( attnIndex + 1, { append: true } );

	}, 3000 );

} );

buildTrack( attnTrack, ATTENTION_STEPS, ( i ) => { stopAttnAutoplay(); goToAttnStep( i ); } );
updateAttnUI();
updateKvReadout();

function enterAttention() {

	proc.setTitle( 'forward pass — self-attention' );
	attnIndex = 0;
	worlds.attention.goToStep( 0 );
	worlds.attention.setHead( 0 );
	worlds.attention.setComputeMode( 'naive' );
	attnMode = 'naive';
	attnHeadSlider.value = '0';
	attnHeadReadout.textContent = `1 / ${ HEAD_COUNT }`;
	attnKvChipsEl.querySelectorAll( '.chip' ).forEach( ( c, i ) => c.classList.toggle( 'active', i === 0 ) );
	updateKvReadout();
	updateAttnUI();
	printAttnTraceTo( 0 );
	proc.setStatus( `step 1/${ ATTENTION_STEPS.length }`, 'running' );
	flyCameraTo( worlds.attention.getStepView( 0 ), 1.0 );

}

// ---------------------------------------------------------------- 04 output

const OUT_STATIONS = [
	{
		title: 'Output embeddings',
		description: `After all ${ GPT2.nLayer } blocks and the final LayerNorm, every position holds one ${ GPT2.dModel }-dimensional vector. Only the last one is used to predict the next token — the earlier ones have already done their job.`,
	},
	{
		title: 'Linear layer (lm_head)',
		description: `One matrix multiply takes that ${ GPT2.dModel }-dimensional vector to ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) } numbers. GPT-2 ties this weight to the input embedding matrix, so scoring a token is a dot product against that token's own embedding row.`,
	},
	{
		title: 'Logits',
		description: 'The raw output: one unbounded score per vocabulary entry. A logit means nothing on its own — only its size relative to the other 50,256 matters.',
	},
	{
		title: 'Temperature, then softmax',
		description: 'Every logit is divided by T, then softmax exponentiates and normalises them into probabilities that sum to 1. Low T sharpens, high T flattens; the ranking is untouched either way.',
	},
	{
		title: 'Top-p nucleus',
		description: 'Sort by probability, keep the shortest prefix whose total reaches p, discard the rest and renormalise. The nucleus shrinks when the model is confident and grows when it is not.',
	},
];

const outTrack = document.getElementById( 'out-track' );
const outStepNum = document.getElementById( 'out-step-num' );
const outStepTotal = document.getElementById( 'out-step-total' );
const outStepTitle = document.getElementById( 'out-step-title' );
const outStepDesc = document.getElementById( 'out-step-desc' );
const outPlay = document.getElementById( 'out-play' );
const outTableEl = document.getElementById( 'out-table' );
const outSummaryEl = document.getElementById( 'out-summary' );
const tempSlider = document.getElementById( 'temp-slider' );
const tempReadout = document.getElementById( 'temp-readout' );
const toppSlider = document.getElementById( 'topp-slider' );
const toppReadout = document.getElementById( 'topp-readout' );

let outIndex = 0;
let outAutoplayTimer = null;
let outParams = { ...DEFAULTS };

outStepTotal.textContent = String( OUT_STATIONS.length );

function renderOutTable( result ) {

	const rows = result.rows.map( ( r ) => `
		<tr class="${ r.kept ? '' : 'is-dropped' }${ r.index === result.argmaxIndex ? ' is-argmax' : '' }${ r.isTarget ? ' is-target' : '' }">
			<td class="tok">${ r.display }</td>
			<td class="num">${ r.logit.toFixed( 2 ) }</td>
			<td class="num">${ ( r.prob * 100 ).toFixed( 1 ) }%</td>
			<td class="num">${ r.kept ? `${ ( r.sampleProb * 100 ).toFixed( 1 ) }%` : '—' }</td>
		</tr>` ).join( '' );

	outTableEl.innerHTML = `
		<thead><tr><th>Token</th><th class="num">Logit</th><th class="num">p</th><th class="num">After top-p</th></tr></thead>
		<tbody>${ rows }</tbody>`;

	outSummaryEl.textContent =
		`nucleus: ${ result.keptCount } of ${ CANDIDATES.length } shown · mass ${ result.keptMass.toFixed( 3 ) } · entropy ${ result.entropy.toFixed( 3 ) } nats`;

}

function logDecode( result, reason ) {

	proc.write( reason, 'cmd' );
	proc.write( `z / T   T = ${ result.temperature.toFixed( 2 ) }`, 'calc' );
	result.rows.forEach( ( r ) => {

		proc.write( `${ r.display.padEnd( 9 ) } z ${ r.logit.toFixed( 2 ).padStart( 6 ) }  z/T ${ r.scaledLogit.toFixed( 2 ).padStart( 6 ) }  p ${ ( r.prob * 100 ).toFixed( 2 ).padStart( 6 ) }%`, r.kept ? 'out' : 'dim' );

	} );
	proc.write( `top-p  p = ${ result.topP.toFixed( 2 ) }  →  ${ result.keptCount } kept, cumulative ${ result.keptMass.toFixed( 3 ) }`, 'warn' );
	proc.write( `argmax "${ result.rows[ result.argmaxIndex ].token }"  ·  entropy ${ result.entropy.toFixed( 3 ) } nats`, 'ok' );

}

function applyDecode( reason ) {

	const result = worlds.output.setParams( outParams );
	worlds.train.setResult( result );
	renderOutTable( result );
	if ( reason ) logDecode( result, reason );
	return result;

}

function updateOutUI() {

	const station = OUT_STATIONS[ outIndex ];
	outStepNum.textContent = String( outIndex + 1 );
	outStepTitle.textContent = station.title;
	outStepDesc.textContent = station.description;
	paintTrack( outTrack, outIndex );

}

function goToOutStation( index ) {

	outIndex = Math.max( 0, Math.min( OUT_STATIONS.length - 1, index ) );
	updateOutUI();
	flyCameraTo( worlds.output.getStepView( outIndex ), 0.9 );
	proc.setStatus( `station ${ outIndex + 1 }/${ OUT_STATIONS.length }`, outIndex === OUT_STATIONS.length - 1 ? 'done' : 'running' );

}

function stopOutAutoplay() {

	if ( outAutoplayTimer ) { clearInterval( outAutoplayTimer ); outAutoplayTimer = null; outPlay.innerHTML = PLAY_ICON; }

}

document.getElementById( 'out-prev' ).addEventListener( 'click', () => { stopOutAutoplay(); goToOutStation( outIndex - 1 ); } );
document.getElementById( 'out-next' ).addEventListener( 'click', () => { stopOutAutoplay(); goToOutStation( outIndex + 1 ); } );
outPlay.addEventListener( 'click', () => {

	if ( outAutoplayTimer ) { stopOutAutoplay(); return; }
	if ( outIndex >= OUT_STATIONS.length - 1 ) goToOutStation( 0 );

	outPlay.innerHTML = PAUSE_ICON;
	outAutoplayTimer = setInterval( () => {

		if ( outIndex >= OUT_STATIONS.length - 1 ) { stopOutAutoplay(); return; }
		goToOutStation( outIndex + 1 );

	}, 3200 );

} );

buildTrack( outTrack, OUT_STATIONS, ( i ) => { stopOutAutoplay(); goToOutStation( i ); } );

// Sliders redraw the scene on every input event but only write to the console
// when the drag settles, so a sweep does not bury the log in noise.
let sliderLogTimer = null;

function scheduleSliderLog( reason ) {

	if ( sliderLogTimer ) clearTimeout( sliderLogTimer );
	sliderLogTimer = setTimeout( () => { logDecode( worlds.output.getResult(), reason ); }, 320 );

}

tempSlider.addEventListener( 'input', () => {

	outParams.temperature = Number( tempSlider.value );
	tempReadout.textContent = outParams.temperature.toFixed( 2 );
	applyDecode( null );
	scheduleSliderLog( `set temperature ${ outParams.temperature.toFixed( 2 ) }` );

} );

toppSlider.addEventListener( 'input', () => {

	outParams.topP = Number( toppSlider.value );
	toppReadout.textContent = outParams.topP.toFixed( 2 );
	applyDecode( null );
	scheduleSliderLog( `set top_p ${ outParams.topP.toFixed( 2 ) }` );

} );

updateOutUI();

function enterOutput() {

	proc.clear();
	proc.setTitle( 'forward pass — output head' );
	proc.write( `h_final = ln_f(x)[-1]`, 'cmd' );
	proc.write( formatVector( FINAL_HIDDEN_STATE, { decimals: 4, max: 6, dims: GPT2.dModel } ), 'out' );
	proc.write( `logits = h_final @ wteᵀ    [${ GPT2.dModel }] × [${ GPT2.dModel }, ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) }]`, 'calc' );
	proc.write( `out    [${ VOCAB_SIZE.toLocaleString( 'en-AU' ) }] logits — top ${ CANDIDATES.length } shown below`, 'dim' );
	proc.rule();

	outIndex = 0;
	updateOutUI();
	applyDecode( `softmax(z / T), top_p = ${ outParams.topP.toFixed( 2 ) }` );
	proc.rule();
	proc.write( 'Probabilities are renormalised over the five candidates shown; the real softmax runs over all 50,257.', 'note' );
	proc.setStatus( `station 1/${ OUT_STATIONS.length }`, 'running' );
	flyCameraTo( worlds.output.getStepView( 0 ), 1.1 );

}

// ---------------------------------------------------------------- 05 train

document.getElementById( 'score-table' ).innerHTML = `
	<thead><tr><th>Score</th><th>Range</th><th>Meaning</th></tr></thead>
	<tbody>${ SCORE_TABLE.map( ( r ) => `<tr><td>${ r.type }</td><td>${ r.range }</td><td>${ r.meaning }</td></tr>` ).join( '' ) }</tbody>`;

document.getElementById( 'train-replay' ).addEventListener( 'click', () => enterTrain() );

function enterTrain() {

	const result = worlds.output.getResult();
	worlds.train.setResult( result );

	proc.clear();
	proc.setTitle( 'backward pass — loss' );
	proc.setStatus( 'computed', 'done' );

	const target = result.rows.find( ( r ) => r.isTarget );
	proc.write( 'loss = F.cross_entropy(logits, targets)', 'cmd' );
	proc.write( `target      "${ target.token }"  (id ${ target.id })`, 'out' );
	proc.write( `P(target)   ${ target.prob.toFixed( 6 ) }`, 'calc' );
	proc.write( `log P       ${ Math.log( target.prob ).toFixed( 6 ) }`, 'calc' );
	proc.write( `NLL         ${ result.nll.toFixed( 6 ) } nats`, 'ok' );
	proc.rule();
	proc.write( 'Inference and training read the same distribution from opposite ends: one samples from it, the other scores the single token that was right.', 'note' );
	proc.write( `This trace used T = ${ result.temperature.toFixed( 2 ) } from page 04. Real training always uses T = 1 — temperature is an inference-time knob and has no place in the loss.`, 'warn' );

	flyCameraTo( worlds.train.defaultView, 1.0 );

}

// ---------------------------------------------------------------- 06 glossary

function enterGlossary() {

	proc.clear();
	proc.setTitle( 'reference' );
	proc.setStatus( 'idle', 'idle' );
	proc.write( `${ GPT2.name }`, 'head' );
	[
		[ 'layers', GPT2.nLayer ],
		[ 'heads', GPT2.nHead ],
		[ 'd_model', GPT2.dModel ],
		[ 'd_head', GPT2.dHead ],
		[ 'd_ff', GPT2.dFF ],
		[ 'vocab', VOCAB_SIZE.toLocaleString( 'en-AU' ) ],
		[ 'context', GPT2.contextLength ],
		[ 'parameters', GPT2.parameters ],
		[ 'norm', `${ GPT2.normPlacement } — LayerNorm before each sub-block` ],
		[ 'lm_head', GPT2.tiedEmbeddings ? 'weight tied to wte' : 'separate weight' ],
	].forEach( ( [ k, v ] ) => proc.write( `${ String( k ).padEnd( 12 ) } ${ v }`, 'out' ) );
	proc.rule();
	proc.write( 'Click any node in the viewport for a definition.', 'dim' );

	flyCameraTo( worlds.glossary.defaultView, 1.0 );

}

// ---------------------------------------------------------------- start

setActiveNav( 'tokenize' );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'tokenize' ) );
enterTokenize();

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
