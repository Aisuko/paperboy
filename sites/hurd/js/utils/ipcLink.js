import * as THREE from 'three';

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

		this.time = Math.random() * 10;
		this.speed = speed;

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

		this.particles = [];
		const pGeo = new THREE.SphereGeometry( radius * 2.4, 8, 8 );
		const pMat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.95 } );

		for ( let i = 0; i < particleCount; i ++ ) {

			const mesh = new THREE.Mesh( pGeo, pMat );
			mesh.userData.phase = i / particleCount;
			parent.add( mesh );
			this.particles.push( mesh );

		}

	}

	setActive( active ) {

		this.tube.material.opacity = active ? 0.34 : 0.12;
		for ( const p of this.particles ) p.visible = active !== false;

	}

	update( dt ) {

		this.time += dt;
		for ( const p of this.particles ) {

			const t = ( p.userData.phase + this.time * this.speed ) % 1;
			this.curve.getPointAt( t, p.position );
			const s = 0.6 + 0.4 * Math.sin( t * Math.PI );
			p.scale.setScalar( s );

		}

	}

	dispose() {

		this.tube.geometry.dispose();
		this.tube.material.dispose();
		for ( const p of this.particles ) p.geometry.dispose();
		if ( this.particles[ 0 ] ) this.particles[ 0 ].material.dispose();

	}

}
