import * as THREE from 'three';
import { BOOT_STEPS } from '../data/bootSteps.js';
import { addStandardLighting, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { buildSystemMap, KERNEL_Y, USER_Y } from '../utils/systemMap.js';

// 03 · What starts first. Same machine as the overview page, but dark: each
// boot step brings one more server up, opens its IPC path down into Mach, and
// leaves it running. By the last step the whole map is lit — which is the
// actual point of the page, that a Hurd system boots by *starting processes*,
// not by loading kernel subsystems.

export function buildBootWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );

	const map = buildSystemMap( scene, { linkOpacity: 0.1 } );
	map.resetStates( 'pending' );

	// GRUB sits below the kernel: firmware handing over, outside the Hurd.
	const grub = new THREE.Mesh(
		new THREE.BoxGeometry( 0.9, 0.12, 0.55 ),
		new THREE.MeshStandardMaterial( { color: THEME.shell, emissive: THEME.muted, emissiveIntensity: 0.18 * EMISSIVE, metalness: 0.5, roughness: 0.6 } ),
	);
	grub.position.set( 0, KERNEL_Y - 0.62, 3.1 );
	map.group.add( grub );
	const grubLabel = createLabel( 'GRUB · bootloader', 'label2d label2d-dim' );
	grubLabel.position.set( 0, 0.28, 0 );
	grub.add( grubLabel );

	// A login banner that only appears on the final step.
	const login = createLabel( 'login:', 'label2d label2d-key' );
	login.position.set( 0, USER_Y + 2.2, 0 );
	login.element.style.opacity = '0';
	map.group.add( login );

	let currentIndex = 0;

	function goToStep( index ) {

		currentIndex = Math.max( 0, Math.min( BOOT_STEPS.length - 1, index ) );
		const step = BOOT_STEPS[ currentIndex ];
		const running = new Set( step.activates );

		map.nodes.forEach( ( node, id ) => {

			if ( ! running.has( id ) ) { map.setState( id, 'pending' ); map.setLinkActive( id, false ); return; }
			map.setState( id, id === step.componentId ? 'active' : 'done' );
			if ( id !== 'gnu-mach' ) map.setLinkActive( id, true );

		} );

		grub.material.emissiveIntensity = ( currentIndex === 0 ? 0.6 : 0.12 ) * EMISSIVE;
		login.element.style.opacity = currentIndex === BOOT_STEPS.length - 1 ? '1' : '0';

	}

	goToStep( 0 );

	// Camera framing: early steps sit low near the kernel, later steps pull
	// back to take in the whole user-space rack as it fills up.
	function getStepView( index ) {

		const i = Math.max( 0, Math.min( BOOT_STEPS.length - 1, index ) );
		const t = i / ( BOOT_STEPS.length - 1 );
		const node = BOOT_STEPS[ i ].componentId ? map.get( BOOT_STEPS[ i ].componentId ) : null;
		const focusX = node ? node.position.x * 0.2 : 0;

		return {
			position: new THREE.Vector3( focusX - 0.9, 5.2 + t * 3.4, 14.6 + t * 3.2 ),
			target: new THREE.Vector3( focusX - 0.9, -1.4 + t * 0.5, 0.6 - t * 2.6 ),
		};

	}

	return {
		scene,
		map,
		interactables: map.interactables,
		totalSteps: BOOT_STEPS.length,
		defaultView: getStepView( 0 ),
		getStepView,
		goToStep,
		update( dt ) {

			map.update( dt, { activeId: BOOT_STEPS[ currentIndex ].componentId } );

		},
	};

}
