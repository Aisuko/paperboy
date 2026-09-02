import * as THREE from 'three';
import { THEME } from './sceneKit.js';

export const CELL = 0.3;
export const GAP = 0.07;

export function valueColor( value, { pos = THEME.accent, neg = THEME.info, dim = false, gain = 1 } = {} ) {

	const m = Math.min( 1, Math.abs( value ) * gain );
	const base = new THREE.Color( value >= 0 ? pos : neg );
	return dim ? base.multiplyScalar( 0.12 ) : base.multiplyScalar( 0.28 + m * 0.85 );

}

export function paintCell( mesh, value, opts = {} ) {

	const c = valueColor( value, opts );
	mesh.material.color.copy( c );
	mesh.material.emissive.copy( c );
	mesh.material.emissiveIntensity = opts.dim ? 0.04 : 0.16 + Math.min( 1, Math.abs( value ) * ( opts.gain || 1 ) ) * 0.55;
	mesh.userData.value = value;

}

function cellMesh( cell, depth ) {

	return new THREE.Mesh(
		new THREE.BoxGeometry( cell, cell, depth ),
		new THREE.MeshStandardMaterial( { color: 0x223034, emissive: 0x223034, emissiveIntensity: 0.2, roughness: 0.45, metalness: 0.2 } ),
	);

}

export function createStrip( { count = 8, cell = CELL, gap = GAP, depth = CELL, axis = 'y', values = null, opts = {} } = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let i = 0; i < count; i ++ ) {

		const mesh = cellMesh( cell, depth );
		const offset = ( i - ( count - 1 ) / 2 ) * step;
		if ( axis === 'y' ) mesh.position.y = -offset;
		else if ( axis === 'x' ) mesh.position.x = offset;
		else mesh.position.z = offset;
		mesh.userData.index = i;
		paintCell( mesh, values ? values[ i ] : 0, opts );
		group.add( mesh );
		cells.push( mesh );

	}

	group.userData = { cells, count, step, cell, length: count * step };
	return group;

}

export function createWall( { rows = 8, cols = 8, cell = 0.22, gap = 0.05, depth = 0.08, values = null, opts = {} } = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let r = 0; r < rows; r ++ ) {

		for ( let c = 0; c < cols; c ++ ) {

			const mesh = cellMesh( cell, depth );
			mesh.scale.set( 1, 1, 1 );
			mesh.position.set( ( c - ( cols - 1 ) / 2 ) * step, ( ( rows - 1 ) / 2 - r ) * step, 0 );
			mesh.userData.row = r;
			mesh.userData.col = c;
			paintCell( mesh, values ? values[ r * cols + c ] : 0, opts );
			group.add( mesh );
			cells.push( mesh );

		}

	}

	group.userData = { cells, rows, cols, step, cell, width: cols * step, height: rows * step };
	return group;

}

export function cellAt( wall, row, col ) {

	const u = wall.userData;
	return u.cells[ row * u.cols + col ];

}

export function createBar( { width = 0.5, depth = 0.5, color = THEME.accent, axis = 'y' } = {} ) {

	const geo = new THREE.BoxGeometry( axis === 'x' ? 1 : width, axis === 'y' ? 1 : width, depth );
	if ( axis === 'y' ) geo.translate( 0, 0.5, 0 );
	else geo.translate( 0.5, 0, 0 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.2 } );
	const mesh = new THREE.Mesh( geo, mat );
	mesh.userData.axis = axis;
	return mesh;

}

export function setBar( mesh, length ) {

	const l = Math.max( 0.001, length );
	if ( mesh.userData.axis === 'y' ) mesh.scale.y = l;
	else mesh.scale.x = l;

}

export function tintBar( mesh, color, intensity = 0.45 ) {

	mesh.material.color.set( color );
	mesh.material.emissive.set( color );
	mesh.material.emissiveIntensity = intensity;

}

export function createLinks( pairs ) {

	const positions = new Float32Array( pairs.length * 6 );
	const colors = new Float32Array( pairs.length * 6 );

	pairs.forEach( ( [ a, b ], i ) => {

		positions.set( [ a.x, a.y, a.z, b.x, b.y, b.z ], i * 6 );

	} );

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geo.setAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );

	const mesh = new THREE.LineSegments( geo, new THREE.LineBasicMaterial( { vertexColors: true, transparent: true, opacity: 0.85 } ) );
	mesh.userData.count = pairs.length;

	mesh.userData.paint = ( fn ) => {

		const c = new THREE.Color();
		for ( let i = 0; i < pairs.length; i ++ ) {

			c.copy( fn( i ) );
			colors.set( [ c.r, c.g, c.b, c.r, c.g, c.b ], i * 6 );

		}
		geo.attributes.color.needsUpdate = true;

	};

	mesh.userData.paint( () => new THREE.Color( THEME.muted ).multiplyScalar( 0.35 ) );
	return mesh;

}

export function createFrame( width, height, { color = THEME.ink, opacity = 0.2 } = {} ) {

	const geo = new THREE.EdgesGeometry( new THREE.PlaneGeometry( width, height ) );
	return new THREE.LineSegments( geo, new THREE.LineBasicMaterial( { color, transparent: true, opacity } ) );

}

export function createCurve( fn, { from = -3, to = 3, segments = 64, width = 3, height = 1.6, yScale = null, radius = 0.03, color = THEME.signal } = {} ) {

	const pts = [];
	const ys = [];
	for ( let i = 0; i <= segments; i ++ ) ys.push( fn( from + ( i / segments ) * ( to - from ) ) );
	const maxY = yScale || Math.max( ...ys.map( Math.abs ) );

	for ( let i = 0; i <= segments; i ++ ) {

		const t = i / segments;
		pts.push( new THREE.Vector3( ( t - 0.5 ) * width, ( ys[ i ] / maxY ) * height, 0 ) );

	}

	const curve = new THREE.CatmullRomCurve3( pts );
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry( curve, segments, radius, 6, false ),
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.2 } ),
	);
	mesh.userData = { from, to, width, height, maxY, fn };
	return mesh;

}

export function curvePoint( curveMesh, x ) {

	const { from, to, width, height, maxY, fn } = curveMesh.userData;
	const cx = THREE.MathUtils.clamp( x, from, to );
	return new THREE.Vector3( ( ( cx - from ) / ( to - from ) - 0.5 ) * width, ( fn( cx ) / maxY ) * height, 0 );

}
