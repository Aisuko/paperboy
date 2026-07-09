import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';

// A quiet, non-interactive backdrop for the "07 · Run it for real" page —
// this page is mostly a HUD of instructions, so the 3D scene just needs to
// keep the site's visual identity going, not carry any new information.
export function buildQemuWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x4dc3ff );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const monitor = new THREE.Group();

	const frame = new THREE.Mesh(
		new THREE.BoxGeometry( 2.4, 1.5, 0.12 ),
		new THREE.MeshStandardMaterial( { color: 0x0d0d14, metalness: 0.6, roughness: 0.35 } ),
	);
	monitor.add( frame );
	monitor.add( new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.BoxGeometry( 2.4, 1.5, 0.12 ) ),
		new THREE.LineBasicMaterial( { color: 0x4dc3ff, transparent: true, opacity: 0.55 } ),
	) );

	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry( 2.1, 1.2 ),
		new THREE.MeshBasicMaterial( { color: 0x061018 } ),
	);
	screen.position.z = 0.07;
	monitor.add( screen );

	const glow = new THREE.PointLight( 0x4dc3ff, 3.2, 8 );
	glow.position.set( 0, 0, 0.6 );
	monitor.add( glow );

	const stand = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.06, 0.28, 0.5, 16 ),
		new THREE.MeshStandardMaterial( { color: 0x14141c, metalness: 0.6, roughness: 0.4 } ),
	);
	stand.position.y = -1.0;
	monitor.add( stand );

	rig.add( monitor );

	const cursor = document.createElement( 'div' );
	cursor.className = 'label2d label2d-terminal';
	cursor.textContent = 'guest@hurd ~$ _';
	const cursorObj = new CSS2DObject( cursor );
	cursorObj.position.set( 0, -0.15, 0.08 );
	monitor.add( cursorObj );

	monitor.userData.spin = 0.06;

	let elapsed = 0;
	let blinkTimer = 0;

	return {
		scene,
		interactables: [],
		defaultView: {
			position: new THREE.Vector3( 0, 0.4, 4.6 ),
			target: new THREE.Vector3( 0, -0.1, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			monitor.rotation.y = Math.sin( elapsed * 0.18 ) * 0.18;

			blinkTimer += dt;
			if ( blinkTimer > 0.6 ) {

				blinkTimer = 0;
				cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0';

			}

		},
	};

}
