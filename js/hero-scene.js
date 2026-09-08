import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { hex, num, isLight } from './theme.js';

// The field-guide lattice: a floating slab of instanced cells with an
// activation wave running through it, orbited by three rings of signal
// sprites — the tensor walls, IPC packets and logit fields of the sub-sites,
// condensed into one establishing shot. True drag-to-orbit; the wheel is left
// to the page so scrolling still works.

const container = document.getElementById( 'hero-webgl' );
const reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

// Colours come from the --hero-* tokens in css/main.css, so the scene flips
// with the rest of the page. The renderer is alpha, so the background is the
// page's own --bg and needs nothing here.
const PALETTE = {
	fog: hex( '--hero-fog', 0x07090b ),
	a: hex( '--hero-a', 0x4ec9b0 ),
	b: hex( '--hero-b', 0x6ea8fe ),
	c: hex( '--hero-c', 0xe8a33d ),
	envIntensity: num( '--hero-env-intensity', 0.5 ),
	bloomStrength: num( '--hero-bloom-strength', 0.55 ),
	bloomThreshold: num( '--hero-bloom-threshold', 0.55 ),
	starOpacity: num( '--hero-star-opacity', 0.5 ),
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2( PALETTE.fog, 0.028 );

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 120 );
camera.position.set( 3.2, 2.6, 12.5 );

const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild( renderer.domElement );

// -- lighting: soft rig + a real environment so the metal cells reflect ------
scene.add( new THREE.HemisphereLight( 0xffffff, PALETTE.fog, 0.55 ) );
const key = new THREE.DirectionalLight( 0xffffff, 1.1 );
key.position.set( 5, 8, 6 );
scene.add( key );

const pmrem = new THREE.PMREMGenerator( renderer );
scene.environment = pmrem.fromScene( new RoomEnvironment() ).texture;
scene.environmentIntensity = PALETTE.envIntensity;
pmrem.dispose();

const group = new THREE.Group();
scene.add( group );

// -- the lattice --------------------------------------------------------------
const NX = 12, NY = 8, NZ = 4;
const COUNT = NX * NY * NZ;
const SPACING = 0.62;

const latticeGeo = new RoundedBoxGeometry( 0.34, 0.34, 0.34, 2, 0.06 );
const latticeMat = new THREE.MeshStandardMaterial( { color: 0xffffff, metalness: 0.55, roughness: 0.3 } );
const lattice = new THREE.InstancedMesh( latticeGeo, latticeMat, COUNT );

const dummy = new THREE.Object3D();
const baseColors = [];
const bandColors = [ new THREE.Color( PALETTE.a ), new THREE.Color( PALETTE.b ), new THREE.Color( PALETTE.c ) ];
const white = new THREE.Color( 0xffffff );
const tmp = new THREE.Color();
const cellPhase = [];

let i = 0;
for ( let x = 0; x < NX; x ++ ) {

	for ( let y = 0; y < NY; y ++ ) {

		for ( let z = 0; z < NZ; z ++ ) {

			dummy.position.set(
				( x - ( NX - 1 ) / 2 ) * SPACING + ( Math.sin( i * 2.3 ) ) * 0.05,
				( y - ( NY - 1 ) / 2 ) * SPACING + ( Math.sin( i * 3.1 ) ) * 0.05,
				( z - ( NZ - 1 ) / 2 ) * SPACING + ( Math.sin( i * 1.7 ) ) * 0.05,
			);
			dummy.updateMatrix();
			lattice.setMatrixAt( i, dummy.matrix );

			// Bands of the three accents along the diagonal.
			const band = bandColors[ Math.floor( ( ( x + y + z ) / ( NX + NY + NZ - 3 ) ) * 3 ) % 3 ];
			const base = band.clone().multiplyScalar( 0.55 + Math.sin( i * 5.7 ) * 0.12 );
			baseColors.push( base );
			lattice.setColorAt( i, base );
			cellPhase.push( ( x + y + z ) / ( NX + NY + NZ - 3 ) );
			i ++;

		}

	}

}
lattice.instanceColor.needsUpdate = true;
group.add( lattice );

// -- signal rings ---------------------------------------------------------------
function createDiscTexture() {

	const size = 64;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	const grad = ctx.createRadialGradient( size / 2, size / 2, 0, size / 2, size / 2, size / 2 );
	grad.addColorStop( 0, 'rgba(255,255,255,1)' );
	grad.addColorStop( 0.6, 'rgba(255,255,255,0.9)' );
	grad.addColorStop( 1, 'rgba(255,255,255,0)' );
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, size, size );
	const tex = new THREE.CanvasTexture( canvas );
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;

}

const discTexture = createDiscTexture();
const rings = [];

[
	{ radius: 5.4, tilt: 0.5, color: PALETTE.a, speed: 0.1 },
	{ radius: 6.4, tilt: -0.35, color: PALETTE.b, speed: -0.07 },
	{ radius: 7.4, tilt: 0.15, color: PALETTE.c, speed: 0.05 },
].forEach( ( spec ) => {

	const N = 24;
	const positions = new Float32Array( N * 3 );
	for ( let k = 0; k < N; k ++ ) {

		const a = ( k / N ) * Math.PI * 2;
		positions[ k * 3 ] = Math.cos( a ) * spec.radius;
		positions[ k * 3 + 1 ] = Math.sin( k * 2.7 ) * 0.18;
		positions[ k * 3 + 2 ] = Math.sin( a ) * spec.radius;

	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	const mat = new THREE.PointsMaterial( {
		color: spec.color,
		size: 0.22,
		map: discTexture,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		// Additive glow dies on a white page; normal blending carries the
		// light theme instead.
		blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
	} );
	const ring = new THREE.Points( geo, mat );
	ring.rotation.x = spec.tilt;
	ring.userData.speed = spec.speed;
	group.add( ring );
	rings.push( ring );

} );

// -- starfield --------------------------------------------------------------------
const STARS = 350;
const starPositions = new Float32Array( STARS * 3 );
for ( let s = 0; s < STARS; s ++ ) {

	const r = 16 + Math.random() * 26;
	const theta = Math.random() * Math.PI * 2;
	const phi = Math.acos( 2 * Math.random() - 1 );
	starPositions[ s * 3 ] = r * Math.sin( phi ) * Math.cos( theta );
	starPositions[ s * 3 + 1 ] = r * Math.cos( phi ) * 0.5;
	starPositions[ s * 3 + 2 ] = r * Math.sin( phi ) * Math.sin( theta );

}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute( 'position', new THREE.BufferAttribute( starPositions, 3 ) );
const starMat = new THREE.PointsMaterial( {
	color: PALETTE.b,
	size: 0.07,
	map: discTexture,
	transparent: true,
	opacity: PALETTE.starOpacity,
	depthWrite: false,
} );
scene.add( new THREE.Points( starGeo, starMat ) );

// -- post: restrained bloom ---------------------------------------------------------
const composer = new EffectComposer( renderer );
composer.addPass( new RenderPass( scene, camera ) );
const bloomPass = new UnrealBloomPass(
	new THREE.Vector2( window.innerWidth, window.innerHeight ),
	PALETTE.bloomStrength,
	0.55,
	PALETTE.bloomThreshold,
);
composer.addPass( bloomPass );
composer.addPass( new OutputPass() );

// -- true drag-to-orbit; the wheel stays with the page ------------------------------
const controls = new OrbitControls( camera, renderer.domElement );
// Damping needs a running loop to settle; static mode renders per-event.
controls.enableDamping = ! reduceMotion;
controls.dampingFactor = 0.06;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = ! reduceMotion;
controls.autoRotateSpeed = 0.5;
controls.minPolarAngle = Math.PI * 0.3;
controls.maxPolarAngle = Math.PI * 0.62;
controls.target.set( 0, 0, 0 );

function onResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );
	if ( reduceMotion ) composer.render();

}
window.addEventListener( 'resize', onResize );

// -- animation ------------------------------------------------------------------------
const clock = new THREE.Clock();
let waveT = 0;

function tick() {

	const dt = Math.min( 0.05, clock.getDelta() );

	if ( ! reduceMotion ) {

		// The activation wave: a bright front travelling along the lattice
		// diagonal, colours lerping toward white as it passes.
		waveT = ( waveT + dt * 0.22 ) % 1.6;
		for ( let n = 0; n < COUNT; n ++ ) {

			const d = Math.abs( cellPhase[ n ] - ( waveT - 0.3 ) );
			const glow = Math.max( 0, 1 - d * 6 );
			tmp.copy( baseColors[ n ] ).lerp( white, glow * 0.85 );
			lattice.setColorAt( n, tmp );

		}
		lattice.instanceColor.needsUpdate = true;

		rings.forEach( ( ring ) => { ring.rotation.z += dt * ring.userData.speed * 3; } );
		group.rotation.y += dt * 0.02;

	}

	controls.update();
	composer.render();

}

let running = true;

document.addEventListener( 'visibilitychange', () => {

	running = document.visibilityState === 'visible';
	if ( running && ! reduceMotion ) renderer.setAnimationLoop( tick );
	else if ( ! running ) renderer.setAnimationLoop( null );

} );

if ( reduceMotion ) {

	// No loop: one frame, then re-render only when the user orbits.
	controls.addEventListener( 'change', () => composer.render() );
	composer.render();

} else {

	renderer.setAnimationLoop( tick );

}
