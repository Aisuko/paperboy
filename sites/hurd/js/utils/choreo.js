import { tween, Easing } from './tween.js';

// Entrance choreography: when a world becomes active its top-level groups
// rise and scale into place with a small stagger. The tween always lands
// exactly on the transform the world authored, so the scene's own animation
// (which moves children *inside* those groups) is never fought.

const REDUCED = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

const DURATION = 0.5;
const STAGGER = 0.045;
const MAX_DELAY = 0.35;
const SCALE_FROM = 0.86;
const RISE = 0.5;

// scene -> [{ obj, tween, end }] for the entrance currently running on it.
const running = new WeakMap();

function eligible( child ) {

	if ( child.isLight || child.isCSS2DObject ) return false;
	if ( child.userData.static ) return false;
	return true;

}

export function enterWorld( scene ) {

	if ( REDUCED ) return;

	// A previous entrance still mid-flight (fast nav toggling) must first be
	// snapped to its end values, or we would capture a shrunken transform as
	// the authored one.
	const prev = running.get( scene );
	if ( prev ) {

		prev.forEach( ( { obj, tween: t, end } ) => {

			t.stop();
			obj.scale.set( end.sx, end.sy, end.sz );
			obj.position.y = end.py;

		} );
		running.delete( scene );

	}

	const entries = [];

	scene.children.filter( eligible ).forEach( ( obj, i ) => {

		// The world's current transform IS the authored one at entry time.
		const end = { sx: obj.scale.x, sy: obj.scale.y, sz: obj.scale.z, py: obj.position.y };
		const delay = Math.min( MAX_DELAY, i * STAGGER );
		const total = delay + DURATION;

		obj.scale.set( end.sx * SCALE_FROM, end.sy * SCALE_FROM, end.sz * SCALE_FROM );
		obj.position.y = end.py - RISE;

		const entry = { obj, end, tween: null };
		entry.tween = tween( total, ( t ) => {

			const local = Math.min( 1, Math.max( 0, ( t * total - delay ) / DURATION ) );
			const e = Easing.cubicOut( local );
			const s = SCALE_FROM + ( 1 - SCALE_FROM ) * e;
			obj.scale.set( end.sx * s, end.sy * s, end.sz * s );
			obj.position.y = end.py - RISE * ( 1 - e );

		}, {
			easing: Easing.linear,
			onComplete: () => {

				obj.scale.set( end.sx, end.sy, end.sz );
				obj.position.y = end.py;

			},
		} );

		entries.push( entry );

	} );

	running.set( scene, entries );

}
