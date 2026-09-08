import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { getComponent, CATEGORIES, COMPONENTS } from './data/components.js';
import { BOOT_STEPS } from './data/bootSteps.js';
import { SHELL_COMMANDS, parseShellInput } from './data/shellCommands.js';
import { TRANSLATOR_OPTIONS, getTranslatorOption } from './data/translators.js';
import { getIpcExample } from './data/ipcExamples.js';
import { QEMU_BOOT_LOG, QEMU_NOTES } from './data/qemuBoot.js';

import { buildOverviewWorld } from './worlds/overview.js';
import { buildComponentsWorld } from './worlds/components.js';
import { buildBootWorld } from './worlds/boot.js';
import { buildCompareWorld } from './worlds/compare.js';
import { buildShellWorld } from './worlds/shell.js';
import { buildTranslatorsWorld } from './worlds/translators.js';
import { buildQemuWorld } from './worlds/qemu.js';

import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';
import { enableShadows } from './utils/sceneKit.js';
import { enterWorld } from './utils/choreo.js';
import { num } from '../../../js/theme.js';

// ---------------------------------------------------------------- renderer

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = new THREE.WebGLRenderer( { antialias: true, powerPreference: 'high-performance' } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
if ( num( '--stage-shadow-gain', 0 ) > 0 ) {

	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

}
container.appendChild( renderer.domElement );

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild( labelRenderer.domElement );

// A long lens (narrow FOV) keeps the map reading like a technical drawing:
// modules at the back stay the same size as modules at the front instead of
// the nearest one swallowing the frame.
const camera = new THREE.PerspectiveCamera( 28, 1, 0.1, 400 );
camera.position.set( -0.9, 7.4, 15.4 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.54;
controls.target.set( 0, 0, 0 );

const composer = new EffectComposer( renderer );
// Additive bloom reads as haze on a light stage, so the light theme dials the
// strength down and lifts the threshold — see --bloom-* in css/base.css.
const bloomPass = new UnrealBloomPass(
	new THREE.Vector2( 1, 1 ),
	0.22 * num( '--bloom-gain', 1 ),
	0.6,
	num( '--bloom-threshold', 0.62 ),
);
const outputPass = new OutputPass();

// ---------------------------------------------------------------- worlds

const worlds = {
	overview: buildOverviewWorld(),
	components: buildComponentsWorld(),
	boot: buildBootWorld(),
	compare: buildCompareWorld(),
	shell: buildShellWorld(),
	translators: buildTranslatorsWorld(),
	qemu: buildQemuWorld(),
};

// One RoomEnvironment PMREM shared by every world: image-based lighting so
// the metallic shells have something to reflect. Strength is a theme token.
const pmrem = new THREE.PMREMGenerator( renderer );
const envMap = pmrem.fromScene( new RoomEnvironment() ).texture;
pmrem.dispose();

Object.values( worlds ).forEach( ( world ) => {

	world.scene.environment = envMap;
	world.scene.environmentIntensity = num( '--env-intensity', 0.35 );
	enableShadows( world.scene );

} );

let currentKey = 'overview';
const renderPass = new RenderPass( worlds.overview.scene, camera );
composer.addPass( renderPass );
composer.addPass( bloomPass );
composer.addPass( outputPass );

bindViewport( viewport, camera, [ renderer, labelRenderer, composer ], ( w, h ) => {

	bloomPass.setSize( w, h );

} );

function flyCameraTo( view, duration = 1.0, { lock = false } = {} ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = ! lock; },
	} );

}

// ---------------------------------------------------------------- console

const proc = new ProcessConsole( document.getElementById( 'console' ) );

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

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	stopBootAutoplay();
	stopShellAutoplay();
	proc.cancel();
	clearHover();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	setActiveNav( key );
	renderPass.scene = worlds[ key ].scene;
	setWorldLabelsVisible( key, true );
	closeDetail();
	enterWorld( worlds[ key ].scene );

	if ( key === 'boot' ) {

		resetBootUI();
		flyCameraTo( worlds.boot.getStepView( 0 ), 1.1 );

	} else if ( key === 'shell' ) {

		resetShellUI();
		flyCameraTo( worlds.shell.defaultView, 1.1 );
		setTimeout( () => shellInputEl.focus(), 600 );

	} else if ( key === 'translators' ) {

		enterTranslators();
		flyCameraTo( worlds.translators.defaultView, 1.1 );

	} else if ( key === 'compare' ) {

		enterCompare();
		flyCameraTo( worlds.compare.defaultView, 1.1 );

	} else if ( key === 'qemu' ) {

		enterQemu();
		flyCameraTo( worlds.qemu.defaultView, 1.1 );

	} else if ( key === 'components' ) {

		enterComponents();
		flyCameraTo( worlds.components.defaultView, 1.1 );

	} else {

		enterOverview();
		flyCameraTo( worlds.overview.defaultView, 1.1 );

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
const detailIpcBlock = document.getElementById( 'detail-ipc-block' );
const detailIpcRpc = document.getElementById( 'detail-ipc-rpc' );
const detailIpcFrom = document.getElementById( 'detail-ipc-from' );
const detailIpcRequest = document.getElementById( 'detail-ipc-request' );
const detailIpcReply = document.getElementById( 'detail-ipc-reply' );
const detailIpcNote = document.getElementById( 'detail-ipc-note' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function fillList( el, items ) {

	el.innerHTML = '';
	( items || [] ).forEach( ( item ) => {

		const li = document.createElement( 'li' );
		li.textContent = item;
		el.appendChild( li );

	} );

}

function openDetail( id ) {

	const comp = getComponent( id );
	if ( ! comp ) return;

	detailCategory.textContent = CATEGORIES[ comp.category ].label;
	detailCategory.style.color = hex( CATEGORIES[ comp.category ].color );
	detailName.textContent = comp.name;
	detailBlurb.textContent = comp.blurb;
	detailDescription.textContent = comp.description;
	fillList( detailResponsibilities, comp.responsibilities );
	detailMonolithic.textContent = comp.monolithic;

	const ipc = getIpcExample( id );
	detailIpcBlock.classList.toggle( 'hidden', ! ipc );
	if ( ipc ) {

		detailIpcRpc.textContent = ipc.rpc;
		detailIpcFrom.textContent = ipc.from;
		fillList( detailIpcRequest, ipc.request );
		fillList( detailIpcReply, ipc.reply );
		detailIpcNote.textContent = ipc.note;

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

function pickComponent( event ) {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );
	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true );
	return hits.length ? hits[ 0 ].object : null;

}

// Hover glow: the component under the pointer gets its emissive boosted by
// --hover-boost. Restores are guarded — if a world repaint changed a
// material's intensity while it was boosted, that material is left alone so
// the repaint's value wins.
const HOVER_BOOST = num( '--hover-boost', 1 );
let hoverRoot = null;
let hoverSaved = [];

function hoverTargetFor( obj ) {

	let node = obj;
	while ( node && ! node.userData.componentId ) node = node.parent;
	return node || obj;

}

function clearHover() {

	hoverSaved.forEach( ( { material, saved, boosted } ) => {

		if ( Math.abs( material.emissiveIntensity - boosted ) < 1e-6 ) material.emissiveIntensity = saved;

	} );
	hoverSaved = [];
	hoverRoot = null;

}

function applyHover( root ) {

	if ( root === hoverRoot ) return;
	clearHover();
	if ( ! root ) return;
	hoverRoot = root;

	root.traverse( ( child ) => {

		if ( ! child.material ) return;
		const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
		mats.forEach( ( m ) => {

			if ( ! m.emissive || ! m.emissiveIntensity ) return;
			const saved = m.emissiveIntensity;
			const boosted = saved * HOVER_BOOST;
			m.emissiveIntensity = boosted;
			hoverSaved.push( { material: m, saved, boosted } );

		} );

	} );

}

renderer.domElement.addEventListener( 'pointermove', ( event ) => {

	const hit = pickComponent( event );
	applyHover( hit ? hoverTargetFor( hit ) : null );
	renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';

} );

renderer.domElement.addEventListener( 'pointerleave', () => {

	clearHover();
	renderer.domElement.style.cursor = 'grab';

} );

renderer.domElement.addEventListener( 'click', ( event ) => {

	const hit = pickComponent( event );
	if ( ! hit ) { closeDetail(); return; }
	if ( hit.userData.componentId ) openDetail( hit.userData.componentId );

} );

// ---------------------------------------------------------------- 01 overview

const legendEl = document.getElementById( 'overview-legend' );
worlds.overview.legendCategories.forEach( ( [ , cat ] ) => {

	const row = document.createElement( 'div' );
	row.className = 'legend-item';
	row.innerHTML = `<span class="legend-dot" style="background:${ hex( cat.color ) }"></span>${ cat.label }`;
	legendEl.appendChild( row );

} );

function enterOverview() {

	proc.clear();
	proc.setTitle( 'system console — inventory' );
	proc.setStatus( 'up', 'done' );

	proc.write( 'uname -a', 'cmd' );
	proc.write( 'GNU hurd-demo 0.9 GNU-Mach 1.8/Hurd-0.9 i686-AT386 GNU', 'out' );
	proc.rule();
	proc.write( 'What is actually running', 'head' );
	proc.write( 'The microkernel below the boundary line provides four things and nothing else:', 'out' );
	[ 'IPC message passing over ports', 'virtual memory management', 'task and thread scheduling', 'the few drivers still in kernel space' ]
		.forEach( ( item ) => proc.write( item, 'dim', { gutter: '·' } ) );
	proc.rule();
	proc.write( 'Everything above the line', 'head' );

	const byCategory = new Map();
	COMPONENTS.forEach( ( c ) => {

		if ( c.category === 'kernel' ) return;
		if ( ! byCategory.has( c.category ) ) byCategory.set( c.category, [] );
		byCategory.get( c.category ).push( c.name );

	} );
	byCategory.forEach( ( names, cat ) => {

		proc.write( `${ CATEGORIES[ cat ].label.padEnd( 24 ) } ${ names.join( '  ' ) }`, 'out' );

	} );

	proc.rule();
	proc.write( `${ COMPONENTS.length - 1 } ordinary user-space processes. Kill any one of them and the kernel keeps running.`, 'note' );

}

// ---------------------------------------------------------------- 02 components

const chipsEl = document.getElementById( 'category-chips' );
document.getElementById( 'component-count' ).textContent = String( COMPONENTS.length );

function renderChips() {

	chipsEl.innerHTML = '';

	const allChip = document.createElement( 'button' );
	allChip.type = 'button';
	allChip.className = 'chip active';
	allChip.textContent = 'All';
	allChip.addEventListener( 'click', () => selectChip( null, allChip ) );
	chipsEl.appendChild( allChip );

	worlds.components.categories.forEach( ( cat ) => {

		const chip = document.createElement( 'button' );
		chip.type = 'button';
		chip.className = 'chip';
		chip.innerHTML = `<span class="legend-dot" style="background:${ hex( cat.color ) }"></span>${ cat.label }`;
		chip.addEventListener( 'click', () => selectChip( cat.key, chip ) );
		chipsEl.appendChild( chip );

	} );

}

function selectChip( key, activeEl ) {

	chipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
	activeEl.classList.add( 'active' );
	worlds.components.setActiveCategory( key );

	if ( key ) {

		const items = COMPONENTS.filter( ( c ) => c.category === key );
		proc.write( `ls /hurd | grep -f ${ key }`, 'cmd' );
		items.forEach( ( c ) => proc.write( `${ c.name.padEnd( 14 ) } ${ c.blurb }`, 'out' ) );

	} else {

		proc.write( 'ls /hurd', 'cmd' );
		proc.write( COMPONENTS.filter( ( c ) => c.category !== 'kernel' ).map( ( c ) => c.name ).join( '  ' ), 'out' );

	}

}

renderChips();

function enterComponents() {

	proc.clear();
	proc.setTitle( 'system console — /hurd' );
	proc.setStatus( 'up', 'done' );
	proc.write( 'ls /hurd', 'cmd' );
	proc.write( COMPONENTS.filter( ( c ) => c.category !== 'kernel' ).map( ( c ) => c.name ).join( '  ' ), 'out' );
	proc.rule();
	proc.write( 'Every name above is a program on disk. A translator is what you get when you point one of them at a node in the filesystem.', 'note' );
	proc.write( 'Pick a category in the viewport to filter the tray.', 'dim' );

}

// ---------------------------------------------------------------- 03 boot

const bootTrack = document.getElementById( 'boot-track' );
const bootStepNum = document.getElementById( 'boot-step-num' );
const bootStepTotal = document.getElementById( 'boot-step-total' );
const bootStepTitle = document.getElementById( 'boot-step-title' );
const bootStepDesc = document.getElementById( 'boot-step-desc' );
const bootPrev = document.getElementById( 'boot-prev' );
const bootNext = document.getElementById( 'boot-next' );
const bootPlay = document.getElementById( 'boot-play' );

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

let bootIndex = 0;
let bootAutoplayTimer = null;

bootStepTotal.textContent = String( BOOT_STEPS.length );

function buildBootTrack() {

	bootTrack.innerHTML = '';
	BOOT_STEPS.forEach( ( step, i ) => {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.title = step.title;
		node.addEventListener( 'click', () => { stopBootAutoplay(); goToBootStep( i ); } );
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

// Re-prints the log from the top up to `index`, so scrubbing backwards leaves
// the console showing exactly what a machine at that point in its boot would.
function printBootLogTo( index ) {

	proc.clear();
	for ( let i = 0; i <= index; i ++ ) proc.writeAll( BOOT_STEPS[ i ].log );

}

function goToBootStep( index, { append = false } = {} ) {

	const next = Math.max( 0, Math.min( BOOT_STEPS.length - 1, index ) );
	const forwardOne = append && next === bootIndex + 1;
	bootIndex = next;

	worlds.boot.goToStep( bootIndex );
	updateBootUI();

	if ( forwardOne ) proc.writeAll( BOOT_STEPS[ bootIndex ].log );
	else printBootLogTo( bootIndex );

	proc.setStatus(
		bootIndex === BOOT_STEPS.length - 1 ? 'login prompt' : `step ${ bootIndex + 1 }/${ BOOT_STEPS.length }`,
		bootIndex === BOOT_STEPS.length - 1 ? 'done' : 'running',
	);

	flyCameraTo( worlds.boot.getStepView( bootIndex ), 0.85 );

}

function resetBootUI() {

	buildBootTrack();
	bootIndex = 0;
	worlds.boot.goToStep( 0 );
	updateBootUI();
	proc.setTitle( 'system console — boot' );
	printBootLogTo( 0 );
	proc.setStatus( `step 1/${ BOOT_STEPS.length }`, 'running' );

}

function stopBootAutoplay() {

	if ( bootAutoplayTimer ) {

		clearInterval( bootAutoplayTimer );
		bootAutoplayTimer = null;
		bootPlay.innerHTML = PLAY_ICON;

	}

}

bootPrev.addEventListener( 'click', () => { stopBootAutoplay(); goToBootStep( bootIndex - 1 ); } );
bootNext.addEventListener( 'click', () => { stopBootAutoplay(); goToBootStep( bootIndex + 1, { append: true } ); } );
bootPlay.addEventListener( 'click', () => {

	if ( bootAutoplayTimer ) { stopBootAutoplay(); return; }

	if ( bootIndex >= BOOT_STEPS.length - 1 ) { resetBootUI(); flyCameraTo( worlds.boot.getStepView( 0 ), 0.6 ); }

	bootPlay.innerHTML = PAUSE_ICON;
	bootAutoplayTimer = setInterval( () => {

		if ( bootIndex >= BOOT_STEPS.length - 1 ) { stopBootAutoplay(); return; }
		goToBootStep( bootIndex + 1, { append: true } );

	}, 2600 );

} );

buildBootTrack();
updateBootUI();

// ---------------------------------------------------------------- 04 compare

const compareNote = document.getElementById( 'compare-note' );

function enterCompare() {

	proc.clear();
	proc.setTitle( 'system console — fault isolation' );
	proc.setStatus( 'up', 'done' );
	proc.write( 'Three kernel designs, one bug', 'head' );
	proc.write( 'A filesystem driver dereferences a null pointer. Where that code runs decides what dies with it.', 'out' );
	proc.rule();
	proc.write( 'monolithic   filesystem code runs in kernel mode → panic takes the machine', 'dim' );
	proc.write( 'hybrid       file server pulled into kernel mode → panic takes the machine', 'dim' );
	proc.write( 'microkernel  ext2fs is a user-space task → the task dies, the machine does not', 'dim' );
	proc.rule();
	proc.write( 'Run the simulation below to watch it happen.', 'note' );

}

document.getElementById( 'compare-crash-btn' ).addEventListener( 'click', ( event ) => {

	const btn = event.currentTarget;
	btn.disabled = true;
	compareNote.classList.add( 'is-live' );

	proc.write( 'inject-fault --driver ext2fs --op null-deref', 'cmd' );
	proc.setStatus( 'fault injected', 'error' );

	let logged = 0;
	worlds.compare.triggerCrash( ( text ) => {

		compareNote.textContent = text;
		// The world reports one note per phase; mirror each into the console.
		const kind = logged === 0 || logged === 1 ? 'err' : ( logged >= 3 ? 'ok' : 'warn' );
		proc.write( text, kind );
		logged ++;

		if ( logged >= 5 ) {

			btn.disabled = false;
			proc.setStatus( 'recovered', 'done' );

		}

	} );

} );

// ---------------------------------------------------------------- 05 shell

const shellForm = document.getElementById( 'shell-form' );
const shellInputEl = document.getElementById( 'shell-input' );
const shellChipsEl = document.getElementById( 'shell-chips' );
const shellStepNum = document.getElementById( 'shell-step-num' );
const shellStepTotal = document.getElementById( 'shell-step-total' );
const shellStepTitle = document.getElementById( 'shell-step-title' );
const shellStepDesc = document.getElementById( 'shell-step-desc' );

const IDLE_SHELL_STEPS = [
	{ title: 'Waiting for input', description: 'Type a command into the console on the left and press Enter.' },
];

let shellSteps = IDLE_SHELL_STEPS;
let shellIndex = 0;
let shellAutoplayTimer = null;

function updateShellStepUI() {

	const step = shellSteps[ shellIndex ];
	shellStepNum.textContent = String( shellIndex + 1 );
	shellStepTotal.textContent = String( shellSteps.length );
	shellStepTitle.textContent = step.title;
	shellStepDesc.textContent = step.description;

}

function stopShellAutoplay() {

	if ( shellAutoplayTimer ) { clearInterval( shellAutoplayTimer ); shellAutoplayTimer = null; }

}

function goToShellStep( index ) {

	shellIndex = Math.max( 0, Math.min( shellSteps.length - 1, index ) );
	worlds.shell.goToStep( shellIndex );
	updateShellStepUI();
	flyCameraTo( worlds.shell.getStepView( shellIndex ), 0.75 );

}

function resetShellUI() {

	stopShellAutoplay();
	worlds.shell.reset();
	shellSteps = IDLE_SHELL_STEPS;
	shellIndex = 0;
	updateShellStepUI();

	proc.clear();
	proc.setTitle( 'system console — bash' );
	proc.setStatus( 'ready', 'idle' );
	proc.write( 'GNU bash, version 5.2.15(1)-release (i686-pc-gnu)', 'dim' );
	proc.write( 'Every command below is traced hop by hop through the servers it touches.', 'note' );
	proc.write( 'Type "help" for the list of modelled commands.', 'dim' );

}

function runShellCommand( raw ) {

	const trimmed = raw.trim();
	if ( ! trimmed ) return;

	proc.write( trimmed, 'cmd' );

	if ( trimmed === 'clear' ) { proc.clear(); return; }

	const parsed = parseShellInput( trimmed );
	if ( ! parsed || ! parsed.spec ) {

		proc.write( `bash: ${ parsed ? parsed.argv[ 0 ] : trimmed }: command not modelled — try ls, cat, ps, whoami, ping or help`, 'err' );
		return;

	}

	stopShellAutoplay();
	const { spec, argv } = parsed;

	worlds.shell.runCommand( spec.steps );
	shellSteps = spec.steps;
	shellIndex = 0;
	updateShellStepUI();
	proc.setStatus( `hop 1/${ shellSteps.length }`, 'running' );
	proc.write( shellSteps[ 0 ].trace, 'dim', { gutter: '→' } );
	flyCameraTo( worlds.shell.getStepView( 0 ), 0.75 );

	shellAutoplayTimer = setInterval( () => {

		if ( shellIndex >= shellSteps.length - 1 ) {

			stopShellAutoplay();
			proc.write( spec.respond( argv ), 'out' );
			proc.setStatus( 'ready', 'idle' );
			return;

		}

		goToShellStep( shellIndex + 1 );
		proc.write( shellSteps[ shellIndex ].trace, 'dim', { gutter: '→' } );
		proc.setStatus( `hop ${ shellIndex + 1 }/${ shellSteps.length }`, 'running' );

	}, 1100 );

}

shellForm.addEventListener( 'submit', ( event ) => {

	event.preventDefault();
	const value = shellInputEl.value;
	shellInputEl.value = '';
	runShellCommand( value );

} );

SHELL_COMMANDS.forEach( ( spec ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip';
	chip.textContent = spec.key;
	chip.title = spec.hint;
	chip.addEventListener( 'click', () => runShellCommand( spec.key ) );
	shellChipsEl.appendChild( chip );

} );

updateShellStepUI();

// ---------------------------------------------------------------- 06 translators

const translatorChipsEl = document.getElementById( 'translator-chips' );
const translatorCommandEl = document.getElementById( 'translator-command' );
const translatorNoteEl = document.getElementById( 'translator-note' );
const translatorAttachBtn = document.getElementById( 'translator-attach' );
const translatorDetachBtn = document.getElementById( 'translator-detach' );

let selectedTranslatorKey = null;

function updateTranslatorButtons() {

	const attachedKey = worlds.translators.getAttachedKey();
	const busy = worlds.translators.isBusy();
	translatorAttachBtn.disabled = busy || ! selectedTranslatorKey || selectedTranslatorKey === attachedKey;
	translatorDetachBtn.disabled = busy || ! attachedKey;

}

worlds.translators.setOnChange( updateTranslatorButtons );

TRANSLATOR_OPTIONS.forEach( ( option ) => {

	const chip = document.createElement( 'button' );
	chip.type = 'button';
	chip.className = 'chip';
	chip.innerHTML = `<span class="legend-dot" style="background:${ hex( CATEGORIES.filesystem.color ) }"></span>${ option.label }`;
	chip.addEventListener( 'click', () => {

		selectedTranslatorKey = option.key;
		translatorChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
		chip.classList.add( 'active' );
		translatorCommandEl.textContent = option.command;
		translatorNoteEl.textContent = option.note;
		updateTranslatorButtons();

	} );
	translatorChipsEl.appendChild( chip );

} );

translatorAttachBtn.addEventListener( 'click', () => {

	if ( ! selectedTranslatorKey ) return;
	const option = getTranslatorOption( selectedTranslatorKey );

	proc.write( option.command, 'cmd' );
	proc.write( `/mnt: passive translator set to /hurd/${ option.key }`, 'ok' );
	proc.write( 'ls /mnt', 'cmd' );
	proc.write( option.listing, 'out' );
	proc.write( option.note, 'note' );
	proc.setStatus( `${ option.key } on /mnt`, 'done' );

	worlds.translators.attach( selectedTranslatorKey );
	updateTranslatorButtons();

} );

translatorDetachBtn.addEventListener( 'click', () => {

	proc.write( 'settrans -g /mnt', 'cmd' );
	proc.write( '/mnt: translator detached, node is an empty directory again', 'warn' );
	proc.setStatus( 'no translator', 'idle' );

	worlds.translators.detach();
	selectedTranslatorKey = null;
	translatorChipsEl.querySelectorAll( '.chip' ).forEach( ( c ) => c.classList.remove( 'active' ) );
	translatorCommandEl.textContent = 'no translator attached';
	translatorNoteEl.textContent = 'Pick a translator in the console, then attach it to /mnt.';
	updateTranslatorButtons();

} );

function enterTranslators() {

	proc.clear();
	proc.setTitle( 'system console — settrans' );
	proc.setStatus( 'no translator', 'idle' );
	proc.write( 'showtrans /mnt', 'cmd' );
	proc.write( '/mnt: no translator', 'out' );
	proc.rule();
	proc.write( 'settrans attaches a program to a filesystem node. Every lookup below that node is then answered by the program instead of the disk.', 'note' );
	proc.write( 'Pick one below and attach it.', 'dim' );
	updateTranslatorButtons();

}

updateTranslatorButtons();

// ---------------------------------------------------------------- 07 qemu

function enterQemu() {

	proc.clear();
	proc.setTitle( 'system console — qemu' );
	proc.setStatus( 'booting', 'running' );
	worlds.qemu.resetScreen();

	proc.stream( QEMU_BOOT_LOG, {
		interval: 330,
		onLine: ( line ) => worlds.qemu.pushLine( line ),
		onDone: () => {

			worlds.qemu.setBooted( true );
			proc.setStatus( 'logged in', 'done' );
			proc.rule();
			proc.writeAll( QEMU_NOTES );

		},
	} );

}

document.getElementById( 'qemu-replay' ).addEventListener( 'click', enterQemu );

// ---------------------------------------------------------------- start

setActiveNav( 'overview' );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'overview' ) );
enterOverview();
enterWorld( worlds.overview.scene );

const loadingEl = document.getElementById( 'loading' );
setTimeout( () => loadingEl.classList.add( 'hidden' ), 700 );

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
