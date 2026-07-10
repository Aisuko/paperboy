import * as THREE from 'three';
import { attachTravelingParticles } from './ipcLink.js';

// A flat, tapered "Sankey band" between two points — the 3D analogue of the
// flowing ribbons in the source 2D transformer-explainer, in place of
// IPCLink's thin round tube.
export function createRibbon( start, end, {
	color = 0xffffff,
	startWidth = 0.05,
	endWidth = 0.14,
	segments = 20,
	arc = 0.9,
	opacity = 0.5,
} = {} ) {

	const mid = start.clone().add( end ).multiplyScalar( 0.5 );
	const dist = start.distanceTo( end );
	mid.y += dist * 0.18 * arc + 0.15;

	const curve = new THREE.CatmullRomCurve3( [ start.clone(), mid, end.clone() ] );
	const points = curve.getPoints( segments );

	const positions = new Float32Array( ( segments + 1 ) * 2 * 3 );
	const uvs = new Float32Array( ( segments + 1 ) * 2 * 2 );
	const indices = [];
	const up = new THREE.Vector3( 0, 1, 0 );

	for ( let i = 0; i <= segments; i ++ ) {

		const t = i / segments;
		const p = points[ i ];
		const pNext = points[ Math.min( segments, i + 1 ) ];
		const pPrev = points[ Math.max( 0, i - 1 ) ];
		const tangent = pNext.clone().sub( pPrev );
		if ( tangent.lengthSq() < 1e-8 ) tangent.set( 1, 0, 0 );
		tangent.normalize();

		const side = new THREE.Vector3().crossVectors( tangent, up );
		if ( side.lengthSq() < 1e-6 ) side.set( 1, 0, 0 );
		side.normalize();

		const width = THREE.MathUtils.lerp( startWidth, endWidth, t );
		const left = p.clone().addScaledVector( side, -width / 2 );
		const right = p.clone().addScaledVector( side, width / 2 );

		positions.set( [ left.x, left.y, left.z ], i * 6 );
		positions.set( [ right.x, right.y, right.z ], i * 6 + 3 );
		uvs.set( [ 0, t, 1, t ], i * 4 );

		if ( i < segments ) {

			const a = i * 2, b = i * 2 + 1, c = ( i + 1 ) * 2, d = ( i + 1 ) * 2 + 1;
			indices.push( a, b, c, b, d, c );

		}

	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geo.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	geo.setIndex( indices );
	geo.computeVertexNormals();

	const mat = new THREE.MeshStandardMaterial( {
		color, emissive: color, emissiveIntensity: 0.5,
		transparent: true, opacity, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.15,
	} );

	const mesh = new THREE.Mesh( geo, mat );
	mesh.userData.curve = curve;
	mesh.userData.baseOpacity = opacity;
	return mesh;

}

// IPCLink-shaped wrapper so attention.js call sites can swap `new IPCLink(...)`
// for `new RibbonLink(...)` with minimal churn.
export class RibbonLink {

	constructor( parent, start, end, color, opts = {} ) {

		this.mesh = createRibbon( start, end, { color, ...opts } );
		parent.add( this.mesh );
		this._particles = opts.particleCount
			? attachTravelingParticles( parent, this.mesh.userData.curve, { color, ...opts } )
			: null;

	}

	setActive( active ) {

		this.mesh.material.opacity = active ? this.mesh.userData.baseOpacity : this.mesh.userData.baseOpacity * 0.2;
		if ( this._particles ) this._particles.setActive( active );

	}

	update( dt ) {

		if ( this._particles ) this._particles.update( dt );

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		if ( this._particles ) this._particles.dispose();

	}

}
