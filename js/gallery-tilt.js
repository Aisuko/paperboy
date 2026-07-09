// Pointer-driven 3D tilt for the gallery tiles, echoing the orbit
// interaction of the field guides themselves in a lightweight CSS form.

const reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const MAX_TILT = 7;

if ( ! reduceMotion ) {

	document.querySelectorAll( '[data-tilt]' ).forEach( ( tile ) => {

		function onMove( event ) {

			const rect = tile.getBoundingClientRect();
			const px = ( event.clientX - rect.left ) / rect.width;
			const py = ( event.clientY - rect.top ) / rect.height;
			const rotY = ( px - 0.5 ) * MAX_TILT * 2;
			const rotX = ( 0.5 - py ) * MAX_TILT * 2;
			tile.style.transform = `perspective(900px) rotateX(${ rotX }deg) rotateY(${ rotY }deg) translateY(-4px)`;

		}

		function onLeave() {

			tile.style.transform = '';

		}

		tile.addEventListener( 'pointermove', onMove );
		tile.addEventListener( 'pointerleave', onLeave );

	} );

}
