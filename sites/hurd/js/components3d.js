import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATEGORIES } from './data/components.js';

const _edgeMat = ( color ) => new THREE.LineBasicMaterial( { color, transparent: true, opacity: 0.55 } );

function addEnergyRing( group, radius, color ) {

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry( radius, 0.012, 8, 48 ),
		new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.5 } ),
	);
	ring.rotation.x = Math.PI / 2;
	ring.userData.isEnergyRing = true;
	group.add( ring );
	return ring;

}

function bodyMaterial( color ) {

	return new THREE.MeshStandardMaterial( {
		color: 0x14141c,
		emissive: color,
		emissiveIntensity: 0.28,
		metalness: 0.65,
		roughness: 0.32,
	} );

}

function addWireEdges( group, geometry, color ) {

	const edges = new THREE.EdgesGeometry( geometry );
	group.add( new THREE.LineSegments( edges, _edgeMat( color ) ) );

}

// GNU Mach: the microkernel core. A layered gem with an inner glowing heart.
function buildCore( color ) {

	const group = new THREE.Group();

	const outer = new THREE.Mesh(
		new THREE.IcosahedronGeometry( 0.62, 1 ),
		new THREE.MeshStandardMaterial( { color: 0x0d0d14, metalness: 0.8, roughness: 0.15, transparent: true, opacity: 0.55, wireframe: false } ),
	);
	group.add( outer );
	addWireEdges( group, new THREE.IcosahedronGeometry( 0.62, 1 ), color );

	const heart = new THREE.Mesh(
		new THREE.IcosahedronGeometry( 0.3, 2 ),
		new THREE.MeshBasicMaterial( { color } ),
	);
	group.add( heart );
	group.userData.heart = heart;

	const light = new THREE.PointLight( color, 6, 6 );
	group.add( light );

	addEnergyRing( group, 0.95, color );
	group.userData.spin = 0.15;
	return group;

}

// Core bootstrap servers (auth, proc, exec, init, crash): a rounded module
// with a raised "chip" on top.
function buildServer( color ) {

	const group = new THREE.Group();
	const base = new THREE.Mesh( new RoundedBoxGeometry( 0.85, 0.5, 0.85, 3, 0.08 ), bodyMaterial( color ) );
	group.add( base );
	addWireEdges( group, new RoundedBoxGeometry( 0.85, 0.5, 0.85, 3, 0.08 ), color );

	const chip = new THREE.Mesh( new RoundedBoxGeometry( 0.42, 0.12, 0.42, 2, 0.03 ), new THREE.MeshBasicMaterial( { color } ) );
	chip.position.y = 0.31;
	group.add( chip );

	addEnergyRing( group, 0.72, color );
	group.userData.spin = 0.08;
	return group;

}

// Small I/O translators (term, null, fifo, symlink): compact capsule.
function buildModule( color ) {

	const group = new THREE.Group();
	const body = new THREE.Mesh( new THREE.CapsuleGeometry( 0.26, 0.32, 4, 12 ), bodyMaterial( color ) );
	body.rotation.z = Math.PI / 2;
	group.add( body );

	const dot = new THREE.Mesh( new THREE.SphereGeometry( 0.08, 12, 12 ), new THREE.MeshBasicMaterial( { color } ) );
	dot.position.x = 0.42;
	group.add( dot );

	addEnergyRing( group, 0.5, color );
	group.userData.spin = 0.22;
	return group;

}

// Filesystem translators: a short stack of disk platters.
function buildDisk( color ) {

	const group = new THREE.Group();
	const platterMat = bodyMaterial( color );
	for ( let i = 0; i < 3; i ++ ) {

		const platter = new THREE.Mesh( new THREE.CylinderGeometry( 0.42, 0.42, 0.09, 28 ), platterMat );
		platter.position.y = -0.18 + i * 0.16;
		group.add( platter );

	}

	addWireEdges( group, new THREE.CylinderGeometry( 0.42, 0.42, 0.09, 28 ), color );
	addEnergyRing( group, 0.62, color );
	group.userData.spin = -0.3;
	return group;

}

// Network translators: a mast with signal rings.
function buildAntenna( color ) {

	const group = new THREE.Group();
	const mast = new THREE.Mesh( new THREE.ConeGeometry( 0.12, 0.7, 12 ), bodyMaterial( color ) );
	mast.position.y = 0.05;
	group.add( mast );

	for ( let i = 0; i < 3; i ++ ) {

		const ring = new THREE.Mesh(
			new THREE.TorusGeometry( 0.28 + i * 0.16, 0.012, 6, 32 ),
			new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.55 - i * 0.12 } ),
		);
		ring.position.y = -0.15 + i * 0.22;
		ring.rotation.x = Math.PI / 2;
		group.add( ring );

	}

	group.userData.spin = 0.4;
	return group;

}

// Memory management: a crystalline octahedron.
function buildCrystal( color ) {

	const group = new THREE.Group();
	const gem = new THREE.Mesh( new THREE.OctahedronGeometry( 0.44, 0 ), bodyMaterial( color ) );
	group.add( gem );
	addWireEdges( group, new THREE.OctahedronGeometry( 0.44, 0 ), color );
	addEnergyRing( group, 0.58, color );
	group.userData.spin = 0.25;
	return group;

}

const BUILDERS = {
	core: buildCore,
	server: buildServer,
	module: buildModule,
	disk: buildDisk,
	antenna: buildAntenna,
	crystal: buildCrystal,
};

// Builds the 3D representation of a single Hurd component (see data/components.js).
export function createComponentObject( component ) {

	const color = CATEGORIES[ component.category ].color;
	const build = BUILDERS[ component.shape ] || buildModule;
	const group = build( color );
	group.userData.componentId = component.id;
	group.userData.category = component.category;
	group.userData.baseScale = 1;
	group.traverse( ( obj ) => { obj.userData.componentId = component.id; } );
	return group;

}

export function pulseHeart( group, t ) {

	if ( group.userData.heart ) {

		const s = 1 + Math.sin( t * 3 ) * 0.08;
		group.userData.heart.scale.setScalar( s );

	}

}
