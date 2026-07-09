import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { tween, tweenVec3, updateTweens, Easing } from './utils/tween.js';
import { buildOverviewWorld } from './worlds/overview.js';
import { buildInputWorld } from './worlds/input.js';
import { buildCouncilWorld } from './worlds/council.js';
import { buildAggregationWorld } from './worlds/aggregation.js';
import { buildOutputWorld } from './worlds/output.js';
import { buildCompareWorld } from './worlds/compare.js';
import { AGGREGATION_STEPS } from './data/aggregationSteps.js';

// ---------------------------------------------------------------- renderer

const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 200 );
camera.position.set( 0, 4.2, 13 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.52;
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
	overview: buildOverviewWorld(),
	input: buildInputWorld(),
	council: buildCouncilWorld(),
	aggregation: buildAggregationWorld(),
	output: buildOutputWorld(),
	compare: buildCompareWorld(),
};

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera );

let currentKey = 'overview';
renderPipeline.outputNode = sceneOutputs.overview;

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
	if ( currentKey === 'aggregation' ) stopAggAutoplay();

	hideWorldLabels( currentKey );
	currentKey = key;
	document.body.dataset.world = key;
	setActiveNav( key );
	setScene( key );
	showWorldLabels( key );
	closeDetail();

	if ( key === 'aggregation' ) {

		resetAggUI();
		flyCameraTo( worlds.aggregation.getStepView( 0 ), 1.2 );

	} else if ( key === 'output' ) {

		worlds.output.reset();
		flyCameraTo( worlds.output.defaultView, 1.2 );

	} else if ( key === 'compare' ) {

		worlds.compare.reset();
		compareNote.textContent = '';
		flyCameraTo( worlds.compare.defaultView, 1.2 );

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
	detailCategory.style.color = payload.color ? '#' + payload.color.toString( 16 ).padStart( 6, '0' ) : '';
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

	if ( currentKey === 'aggregation' ) {

		let node = hit;
		while ( node && node.userData.stepIndex === undefined ) node = node.parent;
		if ( node ) goToAggStep( node.userData.stepIndex );

	}

	let detailNode = hit;
	while ( detailNode && ! detailNode.userData.detail ) detailNode = detailNode.parent;
	if ( detailNode ) openDetail( detailNode.userData.detail );

} );

// ---------------------------------------------------------------- overview legend

const legendEl = document.getElementById( 'overview-legend' );
worlds.overview.legendZones.forEach( ( zone ) => {

	const row = document.createElement( 'div' );
	row.className = 'legend-item';
	row.innerHTML = `<span class="legend-dot" style="background:#${ zone.color.toString( 16 ).padStart( 6, '0' ) }"></span>${ zone.index } · ${ zone.label }`;
	legendEl.appendChild( row );

} );

// ---------------------------------------------------------------- aggregation scrubber

const aggTrack = document.getElementById( 'agg-track' );
const aggStepNum = document.getElementById( 'agg-step-num' );
const aggStepTotal = document.getElementById( 'agg-step-total' );
const aggStepTitle = document.getElementById( 'agg-step-title' );
const aggStepDesc = document.getElementById( 'agg-step-desc' );
const aggPrev = document.getElementById( 'agg-prev' );
const aggNext = document.getElementById( 'agg-next' );
const aggPlay = document.getElementById( 'agg-play' );

let aggIndex = 0;
let aggAutoplayTimer = null;

aggStepTotal.textContent = String( AGGREGATION_STEPS.length );

function buildAggTrack() {

	aggTrack.innerHTML = '';
	AGGREGATION_STEPS.forEach( ( step, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = step.title;
		node.addEventListener( 'click', () => goToAggStep( i ) );
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

function goToAggStep( index ) {

	aggIndex = Math.max( 0, Math.min( AGGREGATION_STEPS.length - 1, index ) );
	worlds.aggregation.goToStep( aggIndex );
	updateAggUI();
	flyCameraTo( worlds.aggregation.getStepView( aggIndex ), 0.9 );

}

function resetAggUI() {

	buildAggTrack();
	aggIndex = 0;
	worlds.aggregation.goToStep( 0 );
	updateAggUI();

}

const aggPlayIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const aggPauseIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

function stopAggAutoplay() {

	if ( aggAutoplayTimer ) {

		clearInterval( aggAutoplayTimer );
		aggAutoplayTimer = null;
		aggPlay.innerHTML = aggPlayIcon;

	}

}

aggPrev.addEventListener( 'click', () => { stopAggAutoplay(); goToAggStep( aggIndex - 1 ); } );
aggNext.addEventListener( 'click', () => { stopAggAutoplay(); goToAggStep( aggIndex + 1 ); } );
aggPlay.addEventListener( 'click', () => {

	if ( aggAutoplayTimer ) { stopAggAutoplay(); return; }

	aggPlay.innerHTML = aggPauseIcon;
	aggAutoplayTimer = setInterval( () => {

		goToAggStep( ( aggIndex + 1 ) % AGGREGATION_STEPS.length );

	}, 2600 );

} );

buildAggTrack();
updateAggUI();

// ---------------------------------------------------------------- why-a-council (compare)

const compareNote = document.getElementById( 'compare-note' );
document.getElementById( 'compare-drift-btn' ).addEventListener( 'click', () => {

	worlds.compare.triggerDrift( ( text ) => { compareNote.textContent = text; } );

} );

// ---------------------------------------------------------------- boot / loading

setActiveNav( 'overview' );

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
