import * as THREE from 'three';

// Spawns `particleCount` small glowing spheres into `parent` that travel
// along `curve` in a looping phase-offset pattern. Shared by IPCLink (round
// tube) and RibbonLink (flat tapered band, see ribbon.js) so both link types
// animate identically without duplicating the phase/sine-pulse math.
export function attachTravelingParticles( parent, curve, { particleCount = 3, speed = 0.35, radius = 0.02, color = 0x8b7bff } = {} ) {

	const particles = [];
	const geo = new THREE.SphereGeometry( radius * 2.4, 8, 8 );
	const mat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.95 } );

	for ( let i = 0; i < particleCount; i ++ ) {

		const mesh = new THREE.Mesh( geo, mat );
		mesh.userData.phase = i / particleCount;
		parent.add( mesh );
		particles.push( mesh );

	}

	let time = Math.random() * 10;

	return {
		particles,
		update( dt ) {

			time += dt;
			for ( const p of particles ) {

				const t = ( p.userData.phase + time * speed ) % 1;
				curve.getPointAt( t, p.position );
				p.scale.setScalar( 0.6 + 0.4 * Math.sin( t * Math.PI ) );

			}

		},
		setActive( active ) {

			for ( const p of particles ) p.visible = active !== false;

		},
		dispose() {

			geo.dispose();
			mat.dispose();

		},
	};

}

// Visualises a Mach IPC channel between two points as a soft glowing tube
// with small pulses of light travelling along it — the closest thing this
// exhibit has to an actual "message being passed between servers".
export class IPCLink {

	constructor( parent, start, end, color = 0x8b7bff, {
		particleCount = 3,
		speed = 0.35,
		radius = 0.02,
		arc = 0.9,
		tubeOpacity = 0.16,
	} = {} ) {

		const mid = new THREE.Vector3().addVectors( start, end ).multiplyScalar( 0.5 );
		const dist = start.distanceTo( end );
		mid.y += dist * 0.18 * arc + 0.15;

		this.curve = new THREE.CatmullRomCurve3( [ start.clone(), mid, end.clone() ] );

		const tubeGeo = new THREE.TubeGeometry( this.curve, 24, radius, 6, false );
		const tubeMat = new THREE.MeshBasicMaterial( {
			color, transparent: true, opacity: tubeOpacity, depthWrite: false,
		} );
		this.tube = new THREE.Mesh( tubeGeo, tubeMat );
		parent.add( this.tube );

		this._particles = attachTravelingParticles( parent, this.curve, { particleCount, speed, radius, color } );

	}

	setActive( active ) {

		this.tube.material.opacity = active ? 0.34 : 0.12;
		this._particles.setActive( active );

	}

	update( dt ) {

		this._particles.update( dt );

	}

	dispose() {

		this.tube.geometry.dispose();
		this.tube.material.dispose();
		this._particles.dispose();

	}

}
