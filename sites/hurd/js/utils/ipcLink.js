import * as THREE from 'three';
import { THEME } from './sceneKit.js';

// A Mach IPC channel drawn as a directed message path: a thin conduit, a cone
// arrowhead at the receiving end, and message packets travelling from sender
// to receiver. Direction is the whole point — the earlier version drew a
// symmetric glowing tube, which showed *that* two servers were connected but
// never which way a request was flowing.

const _up = new THREE.Vector3( 0, 1, 0 );
const _tangent = new THREE.Vector3();

export class IPCLink {

	constructor( parent, start, end, color = THEME.accent, {
		particleCount = 2,
		speed = 0.4,
		radius = 0.012,
		arc = 0.55,
		tubeOpacity = 0.2,
		arrow = true,
		label = null,
	} = {} ) {

		this.parent = parent;
		this.time = Math.random() * 10;
		this.speed = speed;
		this.color = color;
		this.group = new THREE.Group();
		parent.add( this.group );

		const mid = new THREE.Vector3().addVectors( start, end ).multiplyScalar( 0.5 );
		const dist = start.distanceTo( end );
		// Bow the path out of the plane so overlapping links stay separable.
		mid.y += dist * 0.16 * arc;

		this.curve = new THREE.CatmullRomCurve3( [ start.clone(), mid, end.clone() ] );
		this.length = dist;

		this.tubeMaterial = new THREE.MeshBasicMaterial( {
			color, transparent: true, opacity: tubeOpacity, depthWrite: false,
		} );
		this.tube = new THREE.Mesh( new THREE.TubeGeometry( this.curve, 32, radius, 6, false ), this.tubeMaterial );
		this.group.add( this.tube );

		// Arrowhead, parked just short of the receiving end and aimed along
		// the curve's tangent there.
		if ( arrow ) {

			const headLen = Math.min( 0.16, dist * 0.16 );
			this.arrowMaterial = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.85 } );
			this.arrow = new THREE.Mesh( new THREE.ConeGeometry( radius * 4.5, headLen, 10 ), this.arrowMaterial );
			const at = Math.max( 0, 1 - headLen / Math.max( dist, 0.001 ) );
			this.curve.getPointAt( at, this.arrow.position );
			this.curve.getTangentAt( at, _tangent );
			this.arrow.quaternion.setFromUnitVectors( _up, _tangent.normalize() );
			this.group.add( this.arrow );

		}

		this.particleMaterial = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.95 } );
		this.particleGeometry = new THREE.BoxGeometry( radius * 3.4, radius * 3.4, radius * 5 );
		this.particles = [];

		for ( let i = 0; i < particleCount; i ++ ) {

			const mesh = new THREE.Mesh( this.particleGeometry, this.particleMaterial );
			mesh.userData.phase = i / particleCount;
			this.group.add( mesh );
			this.particles.push( mesh );

		}

		if ( label ) this.setLabel( label );

		this.active = true;

	}

	setLabel( labelObject ) {

		this.curve.getPointAt( 0.5, labelObject.position );
		this.group.add( labelObject );
		this.labelObject = labelObject;

	}

	setActive( active ) {

		this.active = active !== false;
		this.tubeMaterial.opacity = this.active ? 0.3 : 0.08;
		if ( this.arrowMaterial ) this.arrowMaterial.opacity = this.active ? 0.85 : 0.18;
		this.particleMaterial.opacity = this.active ? 0.95 : 0;
		for ( const p of this.particles ) p.visible = this.active;
		if ( this.labelObject ) this.labelObject.element.style.opacity = this.active ? '1' : '0.25';

	}

	setVisible( visible ) {

		this.group.visible = visible;

	}

	update( dt ) {

		if ( ! this.active || ! this.group.visible ) return;

		this.time += dt;
		for ( const p of this.particles ) {

			const t = ( p.userData.phase + this.time * this.speed ) % 1;
			this.curve.getPointAt( t, p.position );
			this.curve.getTangentAt( t, _tangent );
			p.quaternion.setFromUnitVectors( _up, _tangent.normalize() );
			// Fade in and out at the ends so packets appear to leave and arrive.
			const s = 0.35 + 0.65 * Math.sin( t * Math.PI );
			p.scale.setScalar( s );

		}

	}

	dispose() {

		this.tube.geometry.dispose();
		this.tubeMaterial.dispose();
		if ( this.arrow ) { this.arrow.geometry.dispose(); this.arrowMaterial.dispose(); }
		this.particleGeometry.dispose();
		this.particleMaterial.dispose();
		if ( this.labelObject && this.labelObject.element && this.labelObject.element.parentNode ) {

			this.labelObject.element.parentNode.removeChild( this.labelObject.element );

		}
		if ( this.group.parent ) this.group.parent.remove( this.group );

	}

}
