import * as THREE from 'three';
import { createLabel, THEME } from './sceneKit.js';
import { attachTravelingParticles } from './ipcLink.js';
import { tween, Easing } from './tween.js';

// The shape vocabulary for every Transformer page.
//
// One rule: a thing on screen is the tensor it stands for. A matrix is a wall
// of cells whose rows and columns are the matrix's rows and columns; a vector
// is a single row or column of the same cells; a weight is a wall you multiply
// by, drawn wider than the activation it consumes; a sum is a ⊕ junction with
// two strips going in and one coming out. Nothing is an orb, a cone or a lathe
// any more — those said "module" without saying which module.
//
// 04 Output already spoke this language (cells for the hidden state, a wall for
// lm_head, bars for the distribution); this file is that language extracted so
// 01, 02 and 03 speak it too.

export const CELL = 0.2;
export const GAP = 0.045;
export const STEP = CELL + GAP;

// Deterministic stand-in values. Real GPT-2 weights are not shipped with this
// page, so every "value" drawn is a seeded number — stable across reloads, so
// two pages showing the same tensor show the same picture.
export function seeded( i ) {

	const x = Math.sin( i * 12.9898 ) * 43758.5453;
	return ( x - Math.floor( x ) ) * 2 - 1;

}

export function seeded01( i ) {

	const x = Math.sin( i * 78.233 ) * 43758.5453;
	return x - Math.floor( x );

}

export function cellMaterial( value, color, { base = 0.3, emissive = 0.18, transparent = false, opacity = 1 } = {} ) {

	const m = Math.min( 1, Math.abs( value ) );
	const c = new THREE.Color( color ).multiplyScalar( base + m * 0.8 );
	return new THREE.MeshStandardMaterial( {
		color: c, emissive: c, emissiveIntensity: emissive + m * 0.5,
		roughness: 0.45, metalness: 0.2, transparent, opacity,
	} );

}

/* --------------------------------------------------------------- matrices */

// A matrix drawn as a wall of cells in the XY plane: column index runs along
// +x, row index runs down from +y, the wall is thin in z. `rows`/`cols` are how
// many cells are *drawn*; `shape` is what the tensor really is, and is printed
// under the wall so the abbreviation is never hidden.
export function createMatrixPanel( {
	rows, cols,
	cell = CELL, gap = GAP, depth = 0.07,
	color = THEME.violet, seed = 0,
	values = null, rowColors = null,
	transparent = false, opacity = 1,
} = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let r = 0; r < rows; r ++ ) {

		for ( let c = 0; c < cols; c ++ ) {

			const i = r * cols + c;
			const value = values ? values[ i ] : seeded( seed + r * 17 + c * 7 );
			const tint = rowColors ? rowColors[ r ] : color;
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry( cell, cell, depth ),
				cellMaterial( value, tint, { transparent, opacity } ),
			);
			mesh.position.set( ( c - ( cols - 1 ) / 2 ) * step, ( ( rows - 1 ) / 2 - r ) * step, 0 );
			mesh.userData.value = value;
			mesh.userData.row = r;
			mesh.userData.col = c;
			group.add( mesh );
			cells.push( mesh );

		}

	}

	group.userData.panel = {
		rows, cols, step, cell, color,
		width: cols * step,
		height: rows * step,
		cells,
	};

	return group;

}

export function panelCell( panel, row, col ) {

	const p = panel.userData.panel;
	return p.cells[ row * p.cols + col ];

}

// Local position of a cell inside its panel — used to aim a conduit at a
// particular row of a weight matrix instead of at the wall in general.
export function cellPosition( panel, row, col ) {

	return panelCell( panel, row, col ).position.clone();

}

export function setPanelValues( panel, values, { color = null, duration = 0.45 } = {} ) {

	const p = panel.userData.panel;
	const tint = color || p.color;

	p.cells.forEach( ( mesh, i ) => {

		const v = values[ i ];
		if ( v === undefined ) return;

		const m = Math.min( 1, Math.abs( v ) );
		const from = mesh.material.color.clone();
		const to = new THREE.Color( tint ).multiplyScalar( 0.3 + m * 0.8 );
		const fromE = mesh.material.emissiveIntensity;
		const toE = 0.18 + m * 0.5;

		tween( duration, ( t ) => {

			mesh.material.color.copy( from ).lerp( to, t );
			mesh.material.emissive.copy( mesh.material.color );
			mesh.material.emissiveIntensity = THREE.MathUtils.lerp( fromE, toE, t );

		}, { easing: Easing.cubicInOut } );

		mesh.userData.value = v;

	} );

}

// Outline around a panel — reads as "this is one tensor", not a loose pile of
// cells, and is what makes a [5 × 768] grid distinguishable from a [768 × 768]
// wall at a glance.
export function addPanelFrame( panel, { color = THEME.ink, opacity = 0.22, pad = 0.08 } = {} ) {

	const p = panel.userData.panel;
	const w = p.width / 2 + pad;
	const h = p.height / 2 + pad;
	const pts = [
		new THREE.Vector3( -w, -h, 0 ), new THREE.Vector3( w, -h, 0 ),
		new THREE.Vector3( w, h, 0 ), new THREE.Vector3( -w, h, 0 ),
		new THREE.Vector3( -w, -h, 0 ),
	];
	const line = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( pts ),
		new THREE.LineBasicMaterial( { color, transparent: true, opacity } ),
	);
	panel.add( line );
	return line;

}

// Title above, tensor shape below. Both are CSS2D, so they stay legible at any
// camera distance and never z-fight with the geometry.
export function labelPanel( panel, title, shape, { titleClass = 'label2d label2d-key', gap = 0.34 } = {} ) {

	const p = panel.userData.panel;
	const labels = {};

	if ( title ) {

		labels.title = createLabel( title, titleClass );
		labels.title.position.set( 0, p.height / 2 + gap, 0 );
		panel.add( labels.title );

	}

	if ( shape ) {

		labels.shape = createLabel( shape, 'label2d label2d-dim' );
		labels.shape.position.set( 0, -p.height / 2 - gap, 0 );
		panel.add( labels.shape );

	}

	return labels;

}

// Row captions down the left edge — the token each row of an activation
// belongs to.
export function labelPanelRows( panel, texts, { className = 'label2d label2d-dim', pad = 0.42 } = {} ) {

	const p = panel.userData.panel;
	return texts.map( ( text, r ) => {

		const label = createLabel( text, className );
		label.position.set( -p.width / 2 - pad, ( ( p.rows - 1 ) / 2 - r ) * p.step, 0 );
		panel.add( label );
		return label;

	} );

}

/* ------------------------------------------------------------- activations */

// A single vector: one row of cells (horizontal) or one column (vertical).
export function createVectorStrip( { length = 8, axis = 'x', cell = CELL, gap = GAP, depth = 0.07, color = THEME.accent, seed = 0, values = null } = {} ) {

	const values2 = values || Array.from( { length }, ( _, i ) => seeded( seed + i * 5 ) );
	const panel = createMatrixPanel( {
		rows: axis === 'x' ? 1 : length,
		cols: axis === 'x' ? length : 1,
		cell, gap, depth, color, values: values2,
	} );
	return panel;

}

// The residual stream: a band of `cols` lanes (one per token) running along an
// axis, made of discrete cells so it reads as a tensor moving, not a pipe.
export function createStreamBand( { cols = 5, segments = 24, cell = 0.16, gap = 0.05, axis = 'y', color = THEME.accent, seed = 11, opacity = 0.85 } = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let s = 0; s < segments; s ++ ) {

		for ( let c = 0; c < cols; c ++ ) {

			const value = 0.35 + seeded01( seed + s * 13 + c * 7 ) * 0.5;
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry( cell, cell, 0.07 ),
				cellMaterial( value, color, { transparent: true, opacity } ),
			);
			const lane = ( c - ( cols - 1 ) / 2 ) * step;
			const along = ( s - ( segments - 1 ) / 2 ) * step;
			if ( axis === 'y' ) mesh.position.set( lane, -along, 0 );
			else mesh.position.set( along, lane, 0 );
			mesh.userData.segment = s;
			group.add( mesh );
			cells.push( mesh );

		}

	}

	group.userData.stream = { cols, segments, step, cell, axis, length: segments * step, width: cols * step, cells };
	return group;

}

/* ------------------------------------------------------------------ flows */

// A conduit between two points, routed through explicit control points so the
// path is drawn where the diagram needs it rather than wherever an automatic
// arc lands. Packets travel along it while the step is live.
export class Conduit {

	constructor( parent, points, color = THEME.accent, {
		radius = 0.028, opacity = 0.3, particleCount = 2, speed = 0.4, particleRadius = 0.03, activeOpacity = 0.45,
	} = {} ) {

		this.curve = new THREE.CatmullRomCurve3( points.map( ( p ) => p.clone() ) );
		this.activeOpacity = activeOpacity;
		this.idleOpacity = opacity;

		this.tube = new THREE.Mesh(
			new THREE.TubeGeometry( this.curve, 40, radius, 8, false ),
			new THREE.MeshBasicMaterial( { color, transparent: true, opacity, depthWrite: false } ),
		);
		parent.add( this.tube );

		this._particles = particleCount
			? attachTravelingParticles( parent, this.curve, { particleCount, speed, radius: particleRadius, color } )
			: null;

	}

	setActive( active ) {

		this.tube.material.opacity = active ? this.activeOpacity : this.idleOpacity * 0.4;
		if ( this._particles ) this._particles.setActive( active );

	}

	update( dt ) {

		if ( this._particles ) this._particles.update( dt );

	}

	dispose() {

		this.tube.geometry.dispose();
		this.tube.material.dispose();
		if ( this._particles ) this._particles.dispose();

	}

}

// Straight-ish conduit with a single bulge, for short hops.
export function conduitPoints( from, to, { bulge = 0.0, axis = 'y' } = {} ) {

	const mid = from.clone().lerp( to, 0.5 );
	if ( axis === 'y' ) mid.y += bulge; else if ( axis === 'x' ) mid.x += bulge; else mid.z += bulge;
	return [ from.clone(), mid, to.clone() ];

}

/* -------------------------------------------------------------- operators */

// ⊕ — elementwise add. Two strips in, one out: the residual junction.
export function createAddNode( { color = THEME.signal, radius = 0.26, thickness = 0.045 } = {} ) {

	const group = new THREE.Group();

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry( radius, thickness, 10, 40 ),
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.9 } ),
	);
	group.add( ring );

	const barMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 1.0, roughness: 0.35, metalness: 0.2 } );
	const barH = new THREE.Mesh( new THREE.BoxGeometry( radius * 1.25, thickness * 1.5, thickness * 1.5 ), barMat );
	const barV = new THREE.Mesh( new THREE.BoxGeometry( thickness * 1.5, radius * 1.25, thickness * 1.5 ), barMat );
	group.add( barH, barV );

	group.userData.radius = radius;
	return group;

}

// A masked cell: the −inf lid that causal masking drops onto the upper
// triangle of the score matrix before softmax runs.
export function createMaskCap( { cell = CELL, color = THEME.rose } = {} ) {

	const group = new THREE.Group();

	const lid = new THREE.Mesh(
		new THREE.BoxGeometry( cell * 1.02, cell * 1.02, 0.12 ),
		new THREE.MeshStandardMaterial( { color: 0x101619, emissive: color, emissiveIntensity: 0.12, roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.94 } ),
	);
	group.add( lid );

	const barMat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.75 } );
	const bar = new THREE.Mesh( new THREE.BoxGeometry( cell * 0.72, 0.022, 0.02 ), barMat );
	bar.position.z = 0.075;
	group.add( bar );

	return group;

}

// A weight wall: the same cells as an activation panel but deeper and colder,
// so "the thing being multiplied by" never looks like "the thing flowing".
export function createWeightWall( { rows = 10, cols = 10, color = THEME.violet, seed = 3, cell = 0.16, gap = 0.03 } = {} ) {

	const panel = createMatrixPanel( { rows, cols, cell, gap, depth: 0.16, color, seed } );
	addPanelFrame( panel, { color, opacity: 0.3 } );
	return panel;

}

/* ---------------------------------------------------------------- staging */

const STATE_FACTORS = {
	active: { opacity: 1.0, emissive: 1.4 },
	done: { opacity: 0.7, emissive: 0.85 },
	pending: { opacity: 0.32, emissive: 0.4 },
	hidden: { opacity: 0.06, emissive: 0.1 },
};

// Dim a whole station without touching its geometry, remembering each
// material's authored values the first time it is asked.
export function setGroupState( group, state, { labels = true } = {} ) {

	const factors = STATE_FACTORS[ state ] || STATE_FACTORS.pending;

	// A hidden station leaves the scene graph rather than fading to a ghost:
	// a 6%-opacity panel is still a raycast target, so a station the page has
	// stepped away from would keep answering clicks meant for the live one.
	group.visible = state !== 'hidden';

	group.traverse( ( child ) => {

		if ( child.isCSS2DObject && labels ) {

			// A hidden station's labels come off the page entirely. Dimmed CSS
			// text still reads at any camera distance, so leaving them at low
			// opacity is what makes a neighbouring station bleed into the frame.
			//
			// It has to be `visible`, not `style.display`: CSS2DRenderer rewrites
			// display on every rendered frame, and only skips an object whose
			// `visible` is false.
			child.visible = state !== 'hidden';
			child.element.style.opacity = state === 'active' ? '1' : '0.5';
			return;

		}

		if ( ! child.material ) return;
		const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
		mats.forEach( ( m ) => {

			if ( m.userData.baseOpacity === undefined ) m.userData.baseOpacity = m.opacity;
			if ( m.userData.baseEmissive === undefined ) m.userData.baseEmissive = m.emissiveIntensity ?? 0;
			m.transparent = true;
			m.opacity = m.userData.baseOpacity * factors.opacity;
			if ( 'emissiveIntensity' in m ) m.emissiveIntensity = m.userData.baseEmissive * factors.emissive;

		} );

	} );

}

// A caption plate that floats beside a station: the operation being performed,
// in the same words the console prints on the left.
export function createOpPlate( text, sub, { className = 'label2d label2d-key' } = {} ) {

	const group = new THREE.Group();
	const title = createLabel( text, className );
	group.add( title );
	if ( sub ) {

		const s = createLabel( sub, 'label2d label2d-dim' );
		s.position.y = -0.3;
		group.add( s );

	}
	return group;

}

/* ---------------------------------------------------------------- framing */

// The bounding box of a set of stations, ignoring CSS2D labels (they carry no
// geometry, and the padding in `fitView` is what keeps them in frame).
export function boundsOf( objects ) {

	const box = new THREE.Box3();
	objects.forEach( ( obj ) => box.union( new THREE.Box3().setFromObject( obj ) ) );
	return box;

}

// A camera position and target that frame `box` from straight on.
//
// `fillY` is deliberately well under 1: the top of every page carries a HUD
// headline on the left and a step card on the right, so the scene has to sit in
// the lower part of the viewport. `biasY` lifts the look-at point above the
// box's centre, which pushes the geometry down the screen by that fraction of
// the visible height.
export function fitView( box, camera, { fillX = 0.86, fillY = 0.54, biasY = 0.17, minDistance = 6 } = {} ) {

	const size = box.getSize( new THREE.Vector3() );
	const centre = box.getCenter( new THREE.Vector3() );

	const vFov = THREE.MathUtils.degToRad( camera.fov );
	const hFov = 2 * Math.atan( Math.tan( vFov / 2 ) * camera.aspect );

	const distance = Math.max(
		minDistance,
		( size.y / fillY / 2 ) / Math.tan( vFov / 2 ),
		( size.x / fillX / 2 ) / Math.tan( hFov / 2 ),
	) + size.z;

	const target = centre.clone();
	target.y += 2 * distance * Math.tan( vFov / 2 ) * biasY;

	return { position: new THREE.Vector3( target.x, target.y, centre.z + distance ), target };

}
