import * as THREE from 'three';

// Ambient background for the landing page hero: a slowly rotating
// constellation of nodes/edges, echoing the servers-talking-over-IPC
// idea behind the GNU/Hurd tour without trying to explain anything itself.

const container = document.getElementById( 'hero-webgl' );
const reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2( 0x06060a, 0.05 );

const camera = new THREE.PerspectiveCamera( 55, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.set( 0, 0.6, 9 );

const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
container.appendChild( renderer.domElement );

const group = new THREE.Group();
scene.add( group );

const NODE_COUNT = 70;
const SPREAD = 6.5;
const LINK_DIST = 2.1;

const nodePositions = [];
for ( let i = 0; i < NODE_COUNT; i ++ ) {

	const v = new THREE.Vector3(
		( Math.random() - 0.5 ) * SPREAD * 2,
		( Math.random() - 0.5 ) * SPREAD,
		( Math.random() - 0.5 ) * SPREAD * 1.4
	);
	nodePositions.push( v );

}

const pointPositions = new Float32Array( NODE_COUNT * 3 );
nodePositions.forEach( ( v, i ) => {

	pointPositions[ i * 3 ] = v.x;
	pointPositions[ i * 3 + 1 ] = v.y;
	pointPositions[ i * 3 + 2 ] = v.z;

} );

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

const pointGeo = new THREE.BufferGeometry();
pointGeo.setAttribute( 'position', new THREE.BufferAttribute( pointPositions, 3 ) );
const pointMat = new THREE.PointsMaterial( {
	color: 0x8b7bff,
	size: 0.14,
	map: createDiscTexture(),
	transparent: true,
	opacity: 0.9,
	sizeAttenuation: true,
	depthWrite: false,
} );
group.add( new THREE.Points( pointGeo, pointMat ) );

const linePositions = [];
for ( let i = 0; i < nodePositions.length; i ++ ) {

	for ( let j = i + 1; j < nodePositions.length; j ++ ) {

		if ( nodePositions[ i ].distanceTo( nodePositions[ j ] ) < LINK_DIST ) {

			linePositions.push(
				nodePositions[ i ].x, nodePositions[ i ].y, nodePositions[ i ].z,
				nodePositions[ j ].x, nodePositions[ j ].y, nodePositions[ j ].z,
			);

		}

	}

}

const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( linePositions ), 3 ) );
const lineMat = new THREE.LineBasicMaterial( { color: 0x35d0ba, transparent: true, opacity: 0.18 } );
group.add( new THREE.LineSegments( lineGeo, lineMat ) );

let targetRotX = 0;
let targetRotY = 0;

function onPointerMove( event ) {

	const nx = ( event.clientX / window.innerWidth ) * 2 - 1;
	const ny = ( event.clientY / window.innerHeight ) * 2 - 1;
	targetRotY = nx * 0.25;
	targetRotX = ny * 0.15;

}
window.addEventListener( 'pointermove', onPointerMove );

function onResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}
window.addEventListener( 'resize', onResize );

let running = true;
document.addEventListener( 'visibilitychange', () => {

	running = document.visibilityState === 'visible';
	if ( running ) requestAnimationFrame( animate );

} );

const clock = new THREE.Clock();

function animate() {

	if ( ! running ) return;
	requestAnimationFrame( animate );

	const dt = clock.getDelta();

	if ( ! reduceMotion ) {

		group.rotation.y += dt * 0.045;
		group.rotation.x += ( targetRotX - group.rotation.x ) * 0.02;
		group.rotation.y += ( targetRotY * 0.2 ) * dt;

	}

	renderer.render( scene, camera );

}

animate();
