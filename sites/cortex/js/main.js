import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';
import { buildTokenizeWorld } from './worlds/tokenize.js';
import { buildBlockWorld } from './worlds/block.js';
import { buildAttentionWorld } from './worlds/attention.js';
import { buildDecodeWorld } from './worlds/decode.js';
import { buildTrainWorld } from './worlds/train.js';
import { buildGlossaryWorld } from './worlds/glossary.js';
import { BLOCK_STAGES } from './data/blockStages.js';
import { ATTENTION_STEPS, HEAD_COUNT, KV_CACHE_NOTE } from './data/attentionSteps.js';
import { TOKENS } from './data/tokens.js';
import { SAMPLING_STRATEGIES, SCORE_TABLE } from './data/vocab.js';

// ---------------------------------------------------------------- renderer

const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 200 );
camera.position.set( 0, 1.6, 6.2 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * 0.55;
controls.target.set( 0, 0, 0 );

const renderPipeline = createRenderPipeline( renderer );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	labelRenderer.setSize( window.innerWidth, window.innerHeight );

} );

// ---------------------------------------------------------------- worlds

const worlds = {
	tokenize: buildTokenizeWorld(),
	block: buildBlockWorld(),
	attention: buildAttentionWorld(),
	decode: buildDecodeWorld(),
	train: buildTrainWorld(),
	glossary: buildGlossaryWorld(),
};

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera );

let currentKey = 'tokenize';
renderPipeline.outputNode = sceneOutputs.tokenize;

function setScene( key ) {

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;

}

function flyCameraTo( view, duration = 1.1 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

// ---------------------------------------------------------------- nav

const navLinks = document.querySelectorAll( '.nav-link' );

function setActiveNav( key ) {

	navLinks.forEach( ( btn ) => btn.classList.toggle( 'active', btn.dataset.goto === key ) );

}

function hideWorldLabels( key ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = 'none';

	} );

}

function showWorldLabels( key ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = '';

	} );

}

function switchWorld( key ) {

	if ( key === currentKey ) return;
	if ( currentKey === 'block' ) stopBlockAutoplay();
	if ( currentKey === 'attention' ) stopAttnAutoplay();

	hideWorldLabels( currentKey );
	currentKey = key;
	document.body.dataset.world = key;
	setActiveNav( key );
	setScene( key );
	showWorldLabels( key );
	closeDetail();

	if ( key === 'block' ) {

		resetBlockUI();
		flyCameraTo( worlds.block.getStepView( 0 ), 1.2 );

	} else if ( key === 'attention' ) {

		resetAttnUI();
		flyCameraTo( worlds.attention.getStepView( 0 ), 1.2 );

	} else if ( key === 'train' ) {

		worlds.train.reset();
		flyCameraTo( worlds.train.defaultView, 1.2 );

	} else {

		flyCameraTo( worlds[ key ].defaultView, 1.2 );

	}

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

function pointerFromEvent( event ) {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

}

function pickObject( event ) {

	pointerFromEvent( event );
	raycaster.setFromCamera( pointer, camera );
	const world = worlds[ currentKey ];
	const hits = raycaster.intersectObjects( world.interactables, true );
	return hits.length ? hits[ 0 ].object : null;

}

renderer.domElement.addEventListener( 'pointermove', ( event ) => {

	const hit = pickObject( event );
	renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';

} );

renderer.domElement.addEventListener( 'click', ( event ) => {

	const hit = pickObject( event );
	if ( ! hit ) { closeDetail(); return; }

	if ( currentKey === 'block' ) {

		let node = hit;
		while ( node && node.userData.stepIndex === undefined ) node = node.parent;
		if ( node ) goToBlockStep( node.userData.stepIndex );

	}

	let detailNode = hit;
	while ( detailNode && ! detailNode.userData.detail ) detailNode = detailNode.parent;
	if ( detailNode ) openDetail( detailNode.userData.detail );

} );

// ---------------------------------------------------------------- 01 tokenize stage chips

const tokenizeChipsEl = document.getElementById( 'tokenize-chips' );
[ '1. Tokens', '2. Embeddings', '3. Neighbours' ].forEach( ( label, i ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( i === 0 ? ' active' : '' );
	chip.textContent = label;
	chip.addEventListener( 'click', () => {

		tokenizeChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.tokenize.showStage( i );

	} );
	tokenizeChipsEl.appendChild( chip );

} );

// ---------------------------------------------------------------- 02 block scrubber

const blockTrack = document.getElementById( 'block-track' );
const blockStepNum = document.getElementById( 'block-step-num' );
const blockStepTotal = document.getElementById( 'block-step-total' );
const blockStepTitle = document.getElementById( 'block-step-title' );
const blockStepDesc = document.getElementById( 'block-step-desc' );
const blockPrev = document.getElementById( 'block-prev' );
const blockNext = document.getElementById( 'block-next' );
const blockPlay = document.getElementById( 'block-play' );

let blockIndex = 0;
let blockAutoplayTimer = null;

blockStepTotal.textContent = String( BLOCK_STAGES.length );

function buildBlockTrack() {

	blockTrack.innerHTML = '';
	BLOCK_STAGES.forEach( ( stage, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = stage.title;
		node.addEventListener( 'click', () => goToBlockStep( i ) );
		blockTrack.appendChild( node );

	} );

}

function updateBlockUI() {

	const stage = BLOCK_STAGES[ blockIndex ];
	blockStepNum.textContent = String( blockIndex + 1 );
	blockStepTitle.textContent = stage.title;
	blockStepDesc.textContent = stage.description;

	[ ...blockTrack.children ].forEach( ( node, i ) => {

		node.classList.toggle( 'active', i === blockIndex );
		node.classList.toggle( 'done', i < blockIndex );

	} );

}

function goToBlockStep( index ) {

	blockIndex = Math.max( 0, Math.min( BLOCK_STAGES.length - 1, index ) );
	worlds.block.goToStep( blockIndex );
	updateBlockUI();
	flyCameraTo( worlds.block.getStepView( blockIndex ), 0.9 );

}

function resetBlockUI() {

	buildBlockTrack();
	blockIndex = 0;
	worlds.block.goToStep( 0 );
	updateBlockUI();

}

const playIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

function stopBlockAutoplay() {

	if ( blockAutoplayTimer ) {

		clearInterval( blockAutoplayTimer );
		blockAutoplayTimer = null;
		blockPlay.innerHTML = playIcon;

	}

}

blockPrev.addEventListener( 'click', () => { stopBlockAutoplay(); goToBlockStep( blockIndex - 1 ); } );
blockNext.addEventListener( 'click', () => { stopBlockAutoplay(); goToBlockStep( blockIndex + 1 ); } );
blockPlay.addEventListener( 'click', () => {

	if ( blockAutoplayTimer ) { stopBlockAutoplay(); return; }
	blockPlay.innerHTML = pauseIcon;
	blockAutoplayTimer = setInterval( () => { goToBlockStep( ( blockIndex + 1 ) % BLOCK_STAGES.length ); }, 2400 );

} );

buildBlockTrack();
updateBlockUI();

// ---------------------------------------------------------------- 03 attention scrubber

const attnTrack = document.getElementById( 'attn-track' );
const attnStepNum = document.getElementById( 'attn-step-num' );
const attnStepTotal = document.getElementById( 'attn-step-total' );
const attnStepTitle = document.getElementById( 'attn-step-title' );
const attnStepDesc = document.getElementById( 'attn-step-desc' );
const attnStepEquations = document.getElementById( 'attn-step-equations' );
const attnPrev = document.getElementById( 'attn-prev' );
const attnNext = document.getElementById( 'attn-next' );
const attnPlay = document.getElementById( 'attn-play' );
const attnKvPanel = document.getElementById( 'attn-kv-panel' );
const attnKvCopy = document.getElementById( 'attn-kv-copy' );
const attnKvOps = document.getElementById( 'attn-kv-ops' );
const attnKvChipsEl = document.getElementById( 'attn-kv-chips' );

let attnIndex = 0;
let attnAutoplayTimer = null;

attnStepTotal.textContent = String( ATTENTION_STEPS.length );

function buildAttnTrack() {

	attnTrack.innerHTML = '';
	ATTENTION_STEPS.forEach( ( step, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = step.title;
		node.addEventListener( 'click', () => goToAttnStep( i ) );
		attnTrack.appendChild( node );

	} );

}

function updateAttnUI() {

	const step = ATTENTION_STEPS[ attnIndex ];
	attnStepNum.textContent = String( attnIndex + 1 );
	attnStepTitle.textContent = step.title;
	attnStepDesc.textContent = step.copy;
	attnStepEquations.textContent = step.equations.join( '\n' );
	attnStepEquations.style.display = step.equations.length ? '' : 'none';

	[ ...attnTrack.children ].forEach( ( node, i ) => {

		node.classList.toggle( 'active', i === attnIndex );
		node.classList.toggle( 'done', i < attnIndex );

	} );

	attnKvPanel.style.display = attnIndex <= 1 ? '' : 'none';

}

function goToAttnStep( index ) {

	attnIndex = Math.max( 0, Math.min( ATTENTION_STEPS.length - 1, index ) );
	worlds.attention.goToStep( attnIndex );
	updateAttnUI();
	flyCameraTo( worlds.attention.getStepView( attnIndex ), 0.9 );

}

function resetAttnUI() {

	buildAttnTrack();
	attnIndex = 0;
	worlds.attention.goToStep( 0 );
	worlds.attention.setHead( 0 );
	worlds.attention.setComputeMode( 'naive' );
	attnHeadChipsEl.querySelectorAll( '.chip' ).forEach( ( c, i ) => c.classList.toggle( 'active', i === 0 ) );
	attnKvChipsEl.querySelectorAll( '.chip' ).forEach( ( c, i ) => c.classList.toggle( 'active', i === 0 ) );
	updateKvOpsReadout( 'naive' );
	updateAttnUI();

}

function stopAttnAutoplay() {

	if ( attnAutoplayTimer ) {

		clearInterval( attnAutoplayTimer );
		attnAutoplayTimer = null;
		attnPlay.innerHTML = playIcon;

	}

}

attnPrev.addEventListener( 'click', () => { stopAttnAutoplay(); goToAttnStep( attnIndex - 1 ); } );
attnNext.addEventListener( 'click', () => { stopAttnAutoplay(); goToAttnStep( attnIndex + 1 ); } );
attnPlay.addEventListener( 'click', () => {

	if ( attnAutoplayTimer ) { stopAttnAutoplay(); return; }
	attnPlay.innerHTML = pauseIcon;
	attnAutoplayTimer = setInterval( () => { goToAttnStep( ( attnIndex + 1 ) % ATTENTION_STEPS.length ); }, 2800 );

} );

buildAttnTrack();
updateAttnUI();

// ---------------------------------------------------------------- 03 attention head selector

const attnHeadChipsEl = document.getElementById( 'attn-head-chips' );
for ( let h = 0; h < HEAD_COUNT; h ++ ) {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( h === 0 ? ' active' : '' );
	chip.textContent = `Head ${ h + 1 }`;
	chip.addEventListener( 'click', () => {

		attnHeadChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.attention.setHead( h );

	} );
	attnHeadChipsEl.appendChild( chip );

}

// ---------------------------------------------------------------- 03 attention KV-cache toggle

attnKvCopy.textContent = KV_CACHE_NOTE.copy;

const kvOps = KV_CACHE_NOTE.opsLabel( TOKENS.length );

function updateKvOpsReadout( mode ) {

	attnKvOps.textContent = mode === 'cache'
		? `KV cache: ~${ kvOps.cache } K/V compute(s) for ${ TOKENS.length } tokens.`
		: `Naive recompute: ~${ kvOps.naive } K/V compute(s) for ${ TOKENS.length } tokens.`;

}

[ [ 'naive', 'Naive recompute' ], [ 'cache', 'KV cache' ] ].forEach( ( [ mode, label ], i ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( i === 0 ? ' active' : '' );
	chip.textContent = label;
	chip.addEventListener( 'click', () => {

		attnKvChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.attention.setComputeMode( mode );
		updateKvOpsReadout( mode );

	} );
	attnKvChipsEl.appendChild( chip );

} );

updateKvOpsReadout( 'naive' );

// ---------------------------------------------------------------- 04 decode chips

const decodeStageChipsEl = document.getElementById( 'decode-stage-chips' );
[ '1. Logits', '2. Softmax' ].forEach( ( label, i ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip' + ( i === 0 ? ' active' : '' );
	chip.textContent = label;
	chip.addEventListener( 'click', () => {

		decodeStageChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.decode.showStage( i );

	} );
	decodeStageChipsEl.appendChild( chip );

} );

const decodeSampleChipsEl = document.getElementById( 'decode-sample-chips' );
SAMPLING_STRATEGIES.forEach( ( strat ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip';
	chip.textContent = strat.label;
	chip.title = strat.note;
	chip.addEventListener( 'click', () => {

		decodeSampleChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		worlds.decode.highlightSampling( strat.pickIds );

	} );
	decodeSampleChipsEl.appendChild( chip );

} );

// ---------------------------------------------------------------- 05 train score table

const scoreTableEl = document.getElementById( 'score-table' );
scoreTableEl.innerHTML = `
	<thead><tr><th>Type</th><th>Range</th><th>Meaning</th></tr></thead>
	<tbody>
		${ SCORE_TABLE.map( ( row ) => `<tr><td>${ row.type }</td><td>${ row.range }</td><td>${ row.meaning }</td></tr>` ).join( '' ) }
	</tbody>
`;

// ---------------------------------------------------------------- boot / loading

setActiveNav( 'tokenize' );

const loadingEl = document.getElementById( 'loading' );
setTimeout( () => loadingEl.classList.add( 'hidden' ), 900 );

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
