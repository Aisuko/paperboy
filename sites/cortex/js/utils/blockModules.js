import * as THREE from 'three';
import { createSlab, createOrbNode } from './sceneKit.js';
import { IPCLink } from './ipcLink.js';

// Four visually distinct 3D "stage modules" for the decoder-block ladder —
// shared by 02 Block (full-size, one per stage) and 03 Attention's step-6
// mini recap ladder (small scale), so the two pages read as the same visual
// language instead of drifting apart.

export const MODULE_FOOTPRINT = { width: 2.6, depth: 1.6 };

function hash( i ) {

	const x = Math.sin( i * 12.9898 ) * 43758.5453;
	return x - Math.floor( x );

}

function stubTube( from, to, radius, color ) {

	const curve = new THREE.CatmullRomCurve3( [ from.clone(), from.clone().lerp( to, 0.5 ), to.clone() ] );
	const geo = new THREE.TubeGeometry( curve, 8, radius, 6, false );
	const mat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.55 } );
	return new THREE.Mesh( geo, mat );

}

function buildLayerNorm( group, scale, color ) {

	const ringGeo = new THREE.TorusGeometry( 0.5 * scale, 0.045 * scale, 8, 32 );
	const ringMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.7, roughness: 0.35, metalness: 0.2 } );
	const ring = new THREE.Mesh( ringGeo, ringMat );
	ring.rotation.x = Math.PI / 2;
	group.add( ring );

	const spikeMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.15 } );
	const spikeCount = 10;
	for ( let i = 0; i < spikeCount; i ++ ) {

		const angle = ( i / spikeCount ) * Math.PI * 2;
		const len = ( 0.22 + hash( i ) * 0.18 ) * scale;
		const spikeGeo = new THREE.ConeGeometry( 0.028 * scale, len, 6 );
		const spike = new THREE.Mesh( spikeGeo, spikeMat );

		const radial = new THREE.Vector3( Math.cos( angle ), 0, Math.sin( angle ) );
		spike.position.copy( radial.clone().multiplyScalar( 0.5 * scale + len / 2 ) );
		spike.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), radial );
		group.add( spike );

	}

}

function buildSelfAttention( group, scale, color, accentColor ) {

	const hub = createOrbNode( { color, radius: 0.12 * scale, emissiveIntensity: 1.2 } );
	group.add( hub );

	const satelliteCount = 4;
	for ( let i = 0; i < satelliteCount; i ++ ) {

		const angle = ( i / satelliteCount ) * Math.PI * 2;
		const y = ( i % 2 === 0 ? 1 : -1 ) * 0.08 * scale;
		const pos = new THREE.Vector3( Math.cos( angle ) * 0.42 * scale, y, Math.sin( angle ) * 0.42 * scale );

		const satellite = createOrbNode( { color: accentColor, radius: 0.06 * scale, emissiveIntensity: 1.1 } );
		satellite.position.copy( pos );
		group.add( satellite );

		const link = new IPCLink( group, pos.clone(), new THREE.Vector3( 0, 0, 0 ), accentColor, {
			particleCount: 1, speed: 0.5, radius: 0.01 * scale, arc: 0.2, tubeOpacity: 0.14,
		} );
		group.userData.links.push( link );

	}

}

function buildResidualAdd( group, scale, color ) {

	const merge = createOrbNode( { color, radius: 0.11 * scale, emissiveIntensity: 1.3 } );
	group.add( merge );

	const inA = new THREE.Vector3( -0.35 * scale, 0.22 * scale, 0 );
	const inB = new THREE.Vector3( 0.1 * scale, 0.3 * scale, 0.15 * scale );
	const out = new THREE.Vector3( 0, -0.22 * scale, 0 );
	const origin = new THREE.Vector3( 0, 0, 0 );

	group.add( stubTube( inA, origin, 0.02 * scale, color ) );
	group.add( stubTube( inB, origin, 0.02 * scale, color ) );
	group.add( stubTube( origin, out, 0.02 * scale, color ) );

}

function buildMlp( group, scale, color ) {

	const pts = [
		new THREE.Vector2( 0.16 * scale, -0.32 * scale ),
		new THREE.Vector2( 0.16 * scale, -0.18 * scale ),
		new THREE.Vector2( 0.40 * scale, -0.05 * scale ),
		new THREE.Vector2( 0.40 * scale, 0.05 * scale ),
		new THREE.Vector2( 0.16 * scale, 0.18 * scale ),
		new THREE.Vector2( 0.16 * scale, 0.32 * scale ),
	];
	const geo = new THREE.LatheGeometry( pts, 24 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.6, roughness: 0.3, metalness: 0.25 } );
	group.add( new THREE.Mesh( geo, mat ) );

	const beltGeo = new THREE.TorusGeometry( 0.4 * scale, 0.02 * scale, 6, 24 );
	const beltMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.35, metalness: 0.2 } );
	const belt = new THREE.Mesh( beltGeo, beltMat );
	belt.rotation.x = Math.PI / 2;
	group.add( belt );

}

const BUILDERS = {
	'layernorm': buildLayerNorm,
	'self-attention': buildSelfAttention,
	'residual-add': buildResidualAdd,
	'mlp': buildMlp,
};

export function createStageModule( type, { scale = 1, color = 0x8b7bff, accentColor = 0xff5da2 } = {} ) {

	const group = new THREE.Group();
	group.userData.type = type;
	group.userData.links = [];

	const plate = createSlab( { width: MODULE_FOOTPRINT.width * scale, depth: MODULE_FOOTPRINT.depth * scale, height: 0.045 * scale, color, opacity: 0.16 } );
	group.add( plate );

	( BUILDERS[ type ] || buildLayerNorm )( group, scale, color, accentColor );

	return group;

}

const STATE_FACTORS = {
	active: { opacity: 1.0, emissive: 1.5 },
	done: { opacity: 0.65, emissive: 1.0 },
	pending: { opacity: 0.4, emissive: 0.55 },
};

export function setModuleState( group, state ) {

	const factors = STATE_FACTORS[ state ] || STATE_FACTORS.pending;

	group.traverse( ( child ) => {

		if ( ! child.material ) return;
		const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
		mats.forEach( ( m ) => {

			if ( m.userData.baseOpacity === undefined ) m.userData.baseOpacity = m.opacity;
			if ( m.userData.baseEmissive === undefined ) m.userData.baseEmissive = m.emissiveIntensity ?? 0;
			m.opacity = m.userData.baseOpacity * factors.opacity;
			if ( 'emissiveIntensity' in m ) m.emissiveIntensity = m.userData.baseEmissive * factors.emissive;

		} );

	} );

}
