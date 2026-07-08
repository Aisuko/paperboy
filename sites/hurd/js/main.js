import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { getComponent, CATEGORIES, COMPONENTS } from './data/components.js';
import { BOOT_STEPS } from './data/bootSteps.js';
import { buildOverviewWorld } from './worlds/overview.js';
import { buildComponentsWorld } from './worlds/components.js';
import { buildBootWorld } from './worlds/boot.js';
import { buildCompareWorld } from './worlds/compare.js';
import { tween, tweenVec3, updateTweens, Easing } from './utils/tween.js';

// ---------------------------------------------------------------- renderer

const container = document.getElementById( 'webgl' );

const renderer = new THREE.WebGLRenderer( { antialias: true, powerPreference: 'high-performance' } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild( renderer.domElement );

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize( window.innerWidth, window.innerHeight );
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 200 );
camera.position.set( 0, 3.4, 7.6 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * 0.52;
controls.target.set( 0, 0, 0 );

const composer = new EffectComposer( renderer );
const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 0.55, 0.5, 0.18 );
const outputPass = new OutputPass();

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	labelRenderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );

} );

// ---------------------------------------------------------------- worlds

const worlds = {
	overview: buildOverviewWorld(),
	components: buildComponentsWorld(),
	boot: buildBootWorld(),
	compare: buildCompareWorld(),
};

let currentKey = 'overview';
let renderPass = new RenderPass( worlds.overview.scene, camera );
composer.addPass( renderPass );
composer.addPass( bloomPass );
composer.addPass( outputPass );

function setScene( key ) {

	renderPass.scene = worlds[ key ].scene;

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

function switchWorld( key ) {

	if ( key === currentKey ) return;
	if ( currentKey === 'boot' ) stopBootAutoplay();

	hideWorldLabels( currentKey );
	currentKey = key;
	document.body.dataset.world = key;
	setActiveNav( key );
	setScene( key );
	closeDetail();

	if ( key === 'boot' ) {

		resetBootUI();
		flyCameraTo( worlds.boot.getStepView( 0 ), 1.2 );

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
const detailResponsibilities = document.getElementById( 'detail-responsibilities' );
const detailMonolithic = document.getElementById( 'detail-monolithic' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function openDetail( id ) {

	const comp = getComponent( id );
	if ( ! comp ) return;

	detailCategory.textContent = CATEGORIES[ comp.category ].label;
	detailCategory.style.color = '#' + CATEGORIES[ comp.category ].color.toString( 16 ).padStart( 6, '0' );
	detailName.textContent = comp.name;
	detailBlurb.textContent = comp.blurb;
	detailDescription.textContent = comp.description;
	detailResponsibilities.innerHTML = '';
	comp.responsibilities.forEach( ( r ) => {

		const li = document.createElement( 'li' );
		li.textContent = r;
		detailResponsibilities.appendChild( li );

	} );
	detailMonolithic.textContent = comp.monolithic;

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

function pickComponent( event ) {

	pointerFromEvent( event );
	raycaster.setFromCamera( pointer, camera );
	const world = worlds[ currentKey ];
	const hits = raycaster.intersectObjects( world.interactables, true );
	return hits.length ? hits[ 0 ].object : null;

}

renderer.domElement.addEventListener( 'pointermove', ( event ) => {

	const hit = pickComponent( event );
	renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';

} );

renderer.domElement.addEventListener( 'click', ( event ) => {

	const hit = pickComponent( event );
	if ( ! hit ) { closeDetail(); return; }

	if ( currentKey === 'boot' ) {

		let node = hit;
		while ( node && node.userData.stepIndex === undefined ) node = node.parent;
		if ( node ) goToBootStep( node.userData.stepIndex );

	}

	if ( hit.userData.componentId ) openDetail( hit.userData.componentId );

} );

// ---------------------------------------------------------------- overview legend

const legendEl = document.getElementById( 'overview-legend' );
worlds.overview.legendCategories.forEach( ( [ key, cat ] ) => {

	const row = document.createElement( 'div' );
	row.className = 'legend-item';
	row.innerHTML = `<span class="legend-dot" style="background:#${ cat.color.toString( 16 ).padStart( 6, '0' ) }"></span>${ cat.label }`;
	legendEl.appendChild( row );

} );

// ---------------------------------------------------------------- category chips

const chipsEl = document.getElementById( 'category-chips' );
document.getElementById( 'component-count' ).textContent = String( COMPONENTS.length );

function renderChips() {

	chipsEl.innerHTML = '';

	const allChip = document.createElement( 'button' );
	allChip.className = 'chip active';
	allChip.textContent = 'All';
	allChip.addEventListener( 'click', () => selectChip( null, allChip ) );
	chipsEl.appendChild( allChip );

	worlds.components.categories.forEach( ( cat ) => {

		const chip = document.createElement( 'button' );
		chip.className = 'chip';
		chip.innerHTML = `<span class="legend-dot" style="background:#${ cat.color.toString( 16 ).padStart( 6, '0' ) }"></span>${ cat.label }`;
		chip.addEventListener( 'click', () => selectChip( cat.key, chip ) );
		chipsEl.appendChild( chip );

	} );

}

function selectChip( key, activeEl ) {

	chipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
	activeEl.classList.add( 'active' );
	worlds.components.setActiveCategory( key );

}

renderChips();

// ---------------------------------------------------------------- boot scrubber

const bootTrack = document.getElementById( 'boot-track' );
const bootStepNum = document.getElementById( 'boot-step-num' );
const bootStepTotal = document.getElementById( 'boot-step-total' );
const bootStepTitle = document.getElementById( 'boot-step-title' );
const bootStepDesc = document.getElementById( 'boot-step-desc' );
const bootPrev = document.getElementById( 'boot-prev' );
const bootNext = document.getElementById( 'boot-next' );
const bootPlay = document.getElementById( 'boot-play' );

let bootIndex = 0;
let bootAutoplayTimer = null;

bootStepTotal.textContent = String( BOOT_STEPS.length );

function buildBootTrack() {

	bootTrack.innerHTML = '';
	BOOT_STEPS.forEach( ( step, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'boot-node';
		node.title = step.title;
		node.addEventListener( 'click', () => goToBootStep( i ) );
		bootTrack.appendChild( node );

	} );

}

function updateBootUI() {

	const step = BOOT_STEPS[ bootIndex ];
	bootStepNum.textContent = String( bootIndex + 1 );
	bootStepTitle.textContent = step.title;
	bootStepDesc.textContent = step.description;

	[ ...bootTrack.children ].forEach( ( node, i ) => {

		node.classList.toggle( 'active', i === bootIndex );
		node.classList.toggle( 'done', i < bootIndex );

	} );

}

function goToBootStep( index ) {

	bootIndex = Math.max( 0, Math.min( BOOT_STEPS.length - 1, index ) );
	worlds.boot.goToStep( bootIndex );
	updateBootUI();
	flyCameraTo( worlds.boot.getStepView( bootIndex ), 0.9 );

}

function resetBootUI() {

	buildBootTrack();
	bootIndex = 0;
	worlds.boot.goToStep( 0 );
	updateBootUI();

}

const bootPlayIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const bootPauseIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

function stopBootAutoplay() {

	if ( bootAutoplayTimer ) {

		clearInterval( bootAutoplayTimer );
		bootAutoplayTimer = null;
		bootPlay.innerHTML = bootPlayIcon;

	}

}

bootPrev.addEventListener( 'click', () => { stopBootAutoplay(); goToBootStep( bootIndex - 1 ); } );
bootNext.addEventListener( 'click', () => { stopBootAutoplay(); goToBootStep( bootIndex + 1 ); } );
bootPlay.addEventListener( 'click', () => {

	if ( bootAutoplayTimer ) { stopBootAutoplay(); return; }

	bootPlay.innerHTML = bootPauseIcon;
	bootAutoplayTimer = setInterval( () => {

		if ( bootIndex >= BOOT_STEPS.length - 1 ) { stopBootAutoplay(); return; }
		goToBootStep( bootIndex + 1 );

	}, 2600 );

} );

buildBootTrack();
updateBootUI();

// ---------------------------------------------------------------- compare

const compareNote = document.getElementById( 'compare-note' );
document.getElementById( 'compare-crash-btn' ).addEventListener( 'click', () => {

	worlds.compare.triggerCrash( ( text ) => { compareNote.textContent = text; } );

} );

// ---------------------------------------------------------------- boot / loading

setActiveNav( 'overview' );
setScene( 'overview' );

const loadingEl = document.getElementById( 'loading' );
setTimeout( () => loadingEl.classList.add( 'hidden' ), 900 );

// ---------------------------------------------------------------- render loop

const clock = new THREE.Clock();

function animate() {

	requestAnimationFrame( animate );
	const dt = Math.min( 0.05, clock.getDelta() );

	updateTweens( dt );
	worlds[ currentKey ].update( dt );
	controls.update();

	composer.render();
	labelRenderer.render( worlds[ currentKey ].scene, camera );

}

animate();
