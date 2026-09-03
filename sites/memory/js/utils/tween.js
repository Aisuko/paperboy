export const Easing = {
	linear: ( t ) => t,
	quadInOut: ( t ) => ( t < 0.5 ? 2 * t * t : 1 - Math.pow( -2 * t + 2, 2 ) / 2 ),
	cubicOut: ( t ) => 1 - Math.pow( 1 - t, 3 ),
	cubicInOut: ( t ) => ( t < 0.5 ? 4 * t * t * t : 1 - Math.pow( -2 * t + 2, 3 ) / 2 ),
	backOut: ( t ) => {

		const c1 = 1.70158, c3 = c1 + 1;
		return 1 + c3 * Math.pow( t - 1, 3 ) + c1 * Math.pow( t - 1, 2 );

	},
};

const active = new Set();

class Tween {

	constructor( duration, easing, onUpdate, onComplete ) {

		this.duration = Math.max( 0.0001, duration );
		this.easing = easing;
		this.onUpdate = onUpdate;
		this.onComplete = onComplete;
		this.elapsed = 0;
		this.done = false;

	}

	step( dt ) {

		if ( this.done ) return;
		this.elapsed += dt;
		const t = Math.min( 1, this.elapsed / this.duration );
		this.onUpdate( this.easing( t ) );
		if ( t >= 1 ) {

			this.done = true;
			if ( this.onComplete ) this.onComplete();
			active.delete( this );

		}

	}

	stop() {

		this.done = true;
		active.delete( this );

	}

}

export function tween( duration, onUpdate, { easing = Easing.cubicInOut, onComplete } = {} ) {

	const t = new Tween( duration, easing, onUpdate, onComplete );
	active.add( t );
	return t;

}

export function updateTweens( dt ) {

	for ( const t of [ ...active ] ) t.step( dt );

}

export function tweenVec3( obj, target, duration, opts ) {

	const start = { x: obj.x, y: obj.y, z: obj.z };
	return tween( duration, ( t ) => {

		obj.x = start.x + ( target.x - start.x ) * t;
		obj.y = start.y + ( target.y - start.y ) * t;
		obj.z = start.z + ( target.z - start.z ) * t;

	}, opts );

}
