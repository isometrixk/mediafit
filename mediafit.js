/*    
	MediaFit

    Copyright (C) 2018  Eric J. Winterstine

    The JavaScript code in this page is free software: you can
    redistribute it and/or modify it under the terms of the GNU
    General Public License (GNU GPL) as published by the Free Software
    Foundation, either version 3 of the License, or (at your option)
    any later version.  The code is distributed WITHOUT ANY WARRANTY;
    without even the implied warranty of MERCHANTABILITY or FITNESS
    FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.

    As additional permission under GNU GPL version 3 section 7, you
    may distribute non-source (e.g., minimized or compacted) forms of
    that code without the copy of the GNU GPL normally required by
    section 4, provided you include this license notice and a URL
    through which recipients can access the Corresponding Source.   
*/

if ( typeof mediafit == "undefined" ) var mediafit = {};


mediafit = (function() {
	var initialized = false;

	var unloadedMediaFits = [];
	var loadedMediaFits = [];
	var failedMediaFits = [];

	var fitQueue = [];
	var fitQueueTimeout = false;

	var scrolledTop;
	var screenHeight;
	var docBody;
	var oldResizeFunc;
	var resizeTimer;
	var oldScrollFunc;
	var youTubeIncrement;

	var options = {
		autoCheck : null,
		autoCheckInterval: null,
		checkOnScroll : null
	};

	var currentTime;
	var previousTime;
	var deltaTime;


	/*
		init
		-------------------------------------------------------------------------
		Initializes the application and sets properties. Also collects & resizes
		any js-mediaFit elements on load.
		-------------------------------------------------------------------------
	*/
	var init = function( mfOptions ) {
		mfOptions = (typeof mfOptions !== 'undefined' ) ? mfOptions : false;		

		if ( !initialized ) {
			scrolledTop = window.pageYOffset;
			screenHeight = window.innerHeight;
			docBody = document.getElementsByTagName('body')[0];
			oldResizeFunc = window.onresize;
			oldScrollFunc = window.onscroll;
			youTubeIncrement = 0;
			previousTime = getTheTime();
		}

		options = {
			autoCheck : true,
			autoCheckInterval: 300,
			checkOnScroll : false
		};
		if ( mfOptions ) {
			setMediaFitOptions(mfOptions);
		}

		if ( !initialized ) {
			collectMediaFits();
			instantiateListeners();
			checkUnloadedMediaFits();
		}		

		if ( options.autoCheck ) {
			checkLoop();
		}

		initialized = true;
	};


	/*
		setMediaFitOptions
		-------------------------------------------------------------------------
		Sets options for mediaFit's behavior.
		-------------------------------------------------------------------------
	*/
	var setMediaFitOptions = function( mfOptions ) {
		for ( var key in mfOptions) {
			if ( typeof options[key] !== 'undefined' ) {
				options[key] = mfOptions[key];
			} 
			else {
				console.warn('mediaFit.js: Ignored unknown property named "'+key+'".');
			}
		}
	};


	/*
		collectMediaFits
		-------------------------------------------------------------------------
		Collects any js-mediaFit elements that have not been collected yet.
		-------------------------------------------------------------------------
	*/
	var collectMediaFits = function() {
		var allDomObjects = document.getElementsByClassName('js-mediaFit');
		for ( var i = 0; i < allDomObjects.length; i++ ) {
			if ( hasClass(allDomObjects[i], 'js-mediaFitCollected') === false ) {
				parseMediaFit(allDomObjects[i]);		
			}
		}
	};


	/*
		parseMediaFit
		-------------------------------------------------------------------------
		Transforms a single js-mediaFit element into a workable object and adds it
		into the unloaded array.
		-------------------------------------------------------------------------
	*/
	var parseMediaFit = function( domObj ) {
		addClass(domObj,'js-mediaFitCollected');

		var mediaType = domObj.tagName.toLowerCase();
		var mediaPosition = domObj.getAttribute('data-position') || false;
		var mediaSource = domObj.getAttribute('src') || domObj.getAttribute('data-src') || false;
		var mediaParent = domObj.parentNode;
		var mediaContain = domObj.getAttribute('data-containAt') || domObj.getAttribute('data-containat') || false;
		var flexContainer = domObj.getAttribute('data-flexContainer') || domObj.getAttribute('data-containerwrap') || false;
		var triggerID = domObj.getAttribute('data-trigger') || false;
		var mediaLazyLoad;

		// Parse the media position into an array or set it's default to [0.5,0.5] (centered)
		if ( mediaPosition !== false && mediaPosition.match(/\d+%?\s\d+%?/) ) {
			mediaPosition = mediaPosition.split(' ');
			mediaPosition[0] = (!isNaN(mediaPosition[0].replace('%',''))) ? parseInt(mediaPosition[0].replace('%',''))/100 : 0.5;
			mediaPosition[1] = (!isNaN(mediaPosition[1].replace('%',''))) ? parseInt(mediaPosition[1].replace('%',''))/100 : 0.5;
		} 
		else {
			mediaPosition = [0.5,0.5];	// default, centered position
		}

		// Parse the media contain percentage
		if ( mediaContain !== false && mediaContain.match(/\d+%?/) ) {
			mediaContain = (!isNaN(mediaContain.replace('%',''))) ? parseInt(mediaContain.replace('%',''))/100 : false;
		} 
		else {
			mediaContainer = false;
		}

		if ( flexContainer !== false && flexContainer.toLowerCase() == "true" ) {
			flexContainer = true;
		}

		if ( domObj.getAttribute('data-lazyLoad') && domObj.getAttribute('data-lazyLoad') != "" || domObj.getAttribute('data-lazyload') && domObj.getAttribute('data-lazyload') != "" ) {
			mediaLazyLoad = true;
			mediaSource = domObj.getAttribute('data-lazyLoad') || domObj.getAttribute('data-lazyload');
		} 
		else {
			mediaLazyLoad = false;
		}

		unloadedMediaFits.push({
			mediaType	:	mediaType,
			loading		:	false,
			loaded		:	false,
			flexContainer:	flexContainer,
			domObject	:	domObj,
			parentDom 	:  	mediaParent,
			domOffset	:	getPageOffset(mediaParent).top,
			mediaObject	:	null,
			mediaSource	:	mediaSource,
			position 	: 	mediaPosition,
			mediaContain :	mediaContain,
			lazyLoad	:	mediaLazyLoad,
			trigger 	: 	triggerID,
			error :   		false
		});
	};


	/*
		checkUnloadedMediaFits
		-------------------------------------------------------------------------
		Loops through the unloaded array of mediaFits to determine whether or not
		we should load it's media or to remove it from the array if it is no longer
		available or an error was thrown.
		-------------------------------------------------------------------------
	*/
	var checkUnloadedMediaFits = function() {
		if ( unloadedMediaFits.length <= 0 ) {
			return false;
		}

		var item;
		for ( var i = 0; i < unloadedMediaFits.length; i++ ) {
			item = unloadedMediaFits[i];

			// Check if the media dom object doesn't exist anymore or there was an error loading it before
			if ( !document.body.contains(item.domObject) || item.error ) {
				unloadedMediaFits.splice(i,1);
				i -= 1;
			}
			else if ( !item.loading && !item.loaded && isVisible(item.parentDom) && withinView(item) && getStyle(item.domObject,'display') !== 'none' ) {
				loadMediaFit(item);								
			}
			else if ( item.loaded ) {
				loadedMediaFits.push(item);
				unloadedMediaFits.splice(i,1);
				i -= 1;
			}
		}
	};


	/*
		setUnloadedOffsets
		-------------------------------------------------------------------------
		Resets all of the unloaded offsets if there was a page resize or device
		orientation change.
		-------------------------------------------------------------------------
	*/
	var setUnloadedOffsets = function() {
		for ( var i = 0; i < unloadedMediaFits.length; i++ ) {
			unloadedMediaFits[i].domOffset = getPageOffset(unloadedMediaFits[i].parentDom).top;
		}
	};


	/*
		loadMediaFit
		-------------------------------------------------------------------------
		Loads a single mediaFit object by performing special tasks for each type
		of media (images, videos, iframes).
		-------------------------------------------------------------------------
	*/
	var loadMediaFit = function( mediaFitItem ) {
		mediaFitItem.loading = true;

		addClass(mediaFitItem.parentDom,'loading');
		addClass(mediaFitItem.domObject,'loading');

		var newMediaObject;
		
		// Images
		// ------------------------------------------
		if ( mediaFitItem.mediaType === 'img' ) {
			newMediaObject = new Image();			
			newMediaObject.onerror = function() {
				console.warn("mediaFit: Cannot load " + this.src + ".\nCheck the filepath and that it is absolute.");
				this.mediaFitItem.error = true;
			};
			newMediaObject.onabort = function() {
				console.warn("mediaFit: Image load aborted for " + this.src + ".");
				this.mediaFitItem.error = true;
			};
			newMediaObject.onload = function() {
				if ( document.body.contains(this.mediaFitItem.domObject) ) {
					this.mediaFitItem.domObject.setAttribute('src',this.src);
					setLoadedMediaFitProperties(this);
				} else {
					this.mediaFitItem.error = true;
				}				
			};
			newMediaObject.queueAttempts = 0;
			newMediaObject.src = mediaFitItem.mediaSource;
			mediaFitItem.mediaObject = newMediaObject;
		}

		// Videos
		// ------------------------------------------
		else if ( mediaFitItem.mediaType === 'video' ) {
			if ( mediaFitItem.domObject.getAttribute('id') ) {
				newMediaObject = document.getElementById( mediaFitItem.domObject.getAttribute('id') );
			}
			else {
				youTubeIncrement++;
				mediaFitItem.domObject.setAttribute('id', ('js-mediaFitVideo' + youTubeIncrement));
				newMediaObject = document.getElementById( mediaFitItem.domObject.getAttribute('id') );
			}
			newMediaObject.failed = 0;
			newMediaObject.onerror = function() {
				if ( this.failed > 10 ) {
					console.warn("mediaFit: Cannot load " + this.src + ".\nCheck the filepath and that it is absolute.");
					this.mediaFitItem.error = true;
				} else {
					if ( this.failed === 0 ) {
						failedMediaFits.push(this);
					}
					setTimeout(function() {
						for ( var f = 0; f < failedMediaFits.length; f++ ) {
							if ( failedMediaFits[f].mediaFitItem.loaded === false ) {
								failedMediaFits[f].mediaFitItem.load();
							}
						}
					},500);
				}
				this.failed++;
			}
			newMediaObject.onabort = function() {
				if ( this.failed > 10 ) {
					console.warn("mediaFit: Video aborted " + this.src + ".\nCheck the filepath and that it is absolute.");
					this.mediaFitItem.error = true;
				} else {
					if ( this.failed === 0 ) {
						failedMediaFits.push(this);
					}
					setTimeout(function() {
						for ( var f = 0; f < failedMediaFits.length; f++ ) {
							if ( failedMediaFits[f].mediaFitItem.loaded === false ) {
								failedMediaFits[f].mediaFitItem.load();
							}
						}
					},500);
				}
				this.failed++;
			};
			newMediaObject.onloadeddata = function() {
				if ( document.body.contains(this.mediaFitItem.domObject) ) {
					var source = document.createElement('source');
					source.src = this.src;
					source.type = 'video/mp4';
					this.mediaFitItem.domObject.appendChild(source);

					setLoadedMediaFitProperties(this);
				} else {
					this.mediaFitItem.error = true;
				}
			};
			newMediaObject.queueAttempts = 0;
			newMediaObject.src = mediaFitItem.mediaSource;
			newMediaObject.load();
			mediaFitItem.mediaObject = newMediaObject;
		}

		// iFrames
		// ------------------------------------------
		else if ( mediaFitItem.mediaType === 'iframe' ) {	
			newMediaObject = {};
			newMediaObject.src = mediaFitItem.mediaSource;
			mediaFitItem.domObject.src = mediaFitItem.mediaSource;
			mediaFitItem.mediaObject = newMediaObject;			
			newMediaObject.mediaFitItem = mediaFitItem;
			newMediaObject.queueAttempts = 0;
			setLoadedMediaFitProperties(newMediaObject);
		}

		newMediaObject.mediaFitItem = mediaFitItem;
	};


	/*
		setLoadedMediaFitProperties
		-------------------------------------------------------------------------
		Default procedure for all media object types once the media is loaded
		-------------------------------------------------------------------------
	*/
	var setLoadedMediaFitProperties = function( imgObj ) {
		fitMedia(imgObj.mediaFitItem);

		if ( imgObj.mediaFitItem.queue && imgObj.queueAttempts < 12 ) {
			imgObj.queueAttempts++;
			fitQueue.push(imgObj);
			if ( fitQueueTimeout === false ) {
				fitQueueTimeout = true;
				setTimeout(function() {
					var fi;
					while ( fitQueue.length ) {
						setLoadedMediaFitProperties( fitQueue.shift() );
					};
					fitQueueTimeout = false;
				},400);
			}
		} else if ( imgObj.queueAttempts >= 12 ) {
			console.warn('mediaFit.js: Could not get width/height dimensions of mediaFit object.');
			console.log('Image source: ' + imgObj.mediaFitItem.mediaSource);
			console.log('Virtual Natural Width: ' + imgObj.mediaFitItem.mediaObject.naturalWidth);
			console.log('Virtual Width: ' + imgObj.mediaFitItem.mediaObject.width);
			console.log('DOM Natural Width: ' + imgObj.mediaFitItem.domObject.naturalWidth);
			console.log('DOM Width: ' + imgObj.mediaFitItem.domObject.width);
			console.log('-----------------------------------------------');
		} else {
			doOnloadEvent(imgObj);
		}
	};


	var doOnloadEvent = function( imgObj ) {
		imgObj.mediaFitItem.loaded = true;
		imgObj.mediaFitItem.loading = false;
		removeClass(imgObj.mediaFitItem.parentDom,'loading');
		removeClass(imgObj.mediaFitItem.domObject,'loading');
		addClass(imgObj.mediaFitItem.parentDom,'loaded');
		addClass(imgObj.mediaFitItem.domObject,'loaded');		

		if ( imgObj.mediaFitItem.trigger !== false ) {
			var triggers = imgObj.mediaFitItem.trigger.split(',');
			for ( var tr = 0; tr < triggers.length; tr++ ) {
				addClass(document.getElementById(triggers[tr]),"loaded");
			}
		}
	};


	/*
		fitMedia
		-------------------------------------------------------------------------
		Fits, contains and positions the mediaFit item within it's container.
		-------------------------------------------------------------------------
	*/
	var fitMedia = function( mediaFitItem ) {
		mediaFitItem.domObject.setAttribute('style','');

		if ( getStyle(mediaFitItem.parentDom,'position') === 'static' || !isVisible(mediaFitItem.parentDom) || getStyle(mediaFitItem.domObject,'display') === 'none' ) {			
			return false;
		}

		mediaFitItem.domObject.style.display = "block";
		mediaFitItem.domObject.style.position = "absolute";

		var mediaWidth = mediaFitItem.mediaObject.naturalWidth || mediaFitItem.mediaObject.width || mediaFitItem.domObject.naturalWidth || mediaFitItem.domObject.width || mediaFitItem.domObject.videoWidth || mediaFitItem.domObject.offsetWidth;
		var mediaHeight = mediaFitItem.mediaObject.naturalHeight || mediaFitItem.mediaObject.height || mediaFitItem.domObject.naturalHeight || mediaFitItem.domObject.height || mediaFitItem.domObject.videoHeight || mediaFitItem.domObject.offsetHeight;
		var mediaRatio = mediaWidth / mediaHeight;

		if ( typeof mediaWidth == 'undefined' || typeof mediaHeight == 'undefined' || isNaN(mediaWidth) || isNaN(mediaHeight) || mediaWidth <= 2 || mediaHeight <= 2 ) {
			mediaFitItem.queue = true;
			return false;
		} else {
			mediaFitItem.queue = false;
		}

		if ( mediaRatio >= 1 ) {
			addClass(mediaFitItem.domObject,'landscape-media');
			addClass(mediaFitItem.parentDom,'landscape-media');
			removeClass(mediaFitItem.domObject,'portrait-media');
			removeClass(mediaFitItem.parentDom,'portrait-media');
		} else {
			addClass(mediaFitItem.domObject,'portrait-media');
			addClass(mediaFitItem.parentDom,'portrait-media');
			removeClass(mediaFitItem.domObject,'landscape-media');
			removeClass(mediaFitItem.parentDom,'landscape-media');
		}

		mediaWidth = mediaFitItem.mediaObject.naturalWidth || mediaFitItem.mediaObject.width || mediaFitItem.domObject.naturalWidth || mediaFitItem.domObject.width || mediaFitItem.domObject.videoWidth || mediaFitItem.domObject.offsetWidth;
		mediaHeight = mediaFitItem.mediaObject.naturalHeight || mediaFitItem.mediaObject.height || mediaFitItem.domObject.naturalHeight || mediaFitItem.domObject.height || mediaFitItem.domObject.videoHeight || mediaFitItem.domObject.offsetHeight;
		mediaRatio = mediaWidth / mediaHeight;
		var containerWidth = mediaFitItem.parentDom.offsetWidth;
		var containerHeight = mediaFitItem.parentDom.offsetHeight;
		var containerRatio = containerWidth / containerHeight;
		var newMediaWidth,newMediaHeight,newXPosition,newYPosition;


		// Special ratio for contained youtube iframes
		if ( mediaFitItem.mediaType === 'iframe' && mediaFitItem.mediaContain !== false || mediaFitItem.mediaType === 'iframe' && mediaFitItem.flexContainer ) {
			mediaRatio = 1.77777778;
			mediaHeight = mediaWidth / mediaRatio;
		} 
		// Or set the w/h to that of the container for iframes...
		else if ( mediaFitItem.mediaType == 'iframe' ) {
			mediaFitItem.domObject.style.width = Math.ceil(containerWidth+1) + "px";
			mediaFitItem.domObject.style.height = Math.ceil(containerHeight+1) + "px";
			mediaFitItem.domObject.style.left = "0px";
			mediaFitItem.domObject.style.top = "0px";	
			return true;
		}

		// If the container is set to flex, let's flex it
		if ( mediaFitItem.flexContainer ) {
			mediaFitItem.parentDom.setAttribute('style','');
			// Determine if we need to flex the container by width or by height
			if ( parseFloat( getStyle(mediaFitItem.parentDom,'height') ) !== 0 ) {
				containerWidth = containerHeight * mediaRatio;
				containerRatio = containerWidth / containerHeight;
				mediaFitItem.parentDom.style.width = containerWidth + "px";
			} else {
				containerHeight = containerWidth / mediaRatio;
				containerRatio = containerWidth / containerHeight;
				mediaFitItem.parentDom.style.height = containerHeight + "px";
			}
		}

		if ( mediaRatio > containerRatio ) {
			var imageDifference = 1 - containerRatio / mediaRatio;

			if ( mediaFitItem.mediaContain !== false && imageDifference >= mediaFitItem.mediaContain ) {
				// Contain the media
				newMediaWidth = containerWidth;				
				newMediaHeight = containerWidth / mediaRatio;
				newXPosition = 0;
				newYPosition = (containerHeight - newMediaHeight) * mediaFitItem.position[1];
			} else {				
				newMediaWidth = containerHeight * mediaRatio;
				newMediaHeight = containerHeight;
				newXPosition = (containerWidth - newMediaWidth) * mediaFitItem.position[0];
				newYPosition = 0;
			}
		} else {
			var imageDifference = 1 - mediaRatio / containerRatio;
			if ( mediaFitItem.mediaContain !== false && imageDifference >= mediaFitItem.mediaContain ) {
				// Contain the media
				newMediaWidth = containerHeight * mediaRatio;
				newMediaHeight = containerHeight;
				newXPosition = (containerWidth - newMediaWidth) * mediaFitItem.position[0];
				newYPosition = 0;
			} else {
				newMediaWidth = containerWidth;
				newMediaHeight = containerWidth / mediaRatio;
				newXPosition = 0;
				newYPosition = (containerHeight - newMediaHeight) * mediaFitItem.position[1];
			}
		}

		mediaFitItem.domObject.style.width = Math.ceil(newMediaWidth+1) + "px";
		mediaFitItem.domObject.style.height = Math.ceil(newMediaHeight+1) + "px";
		mediaFitItem.domObject.style.left = Math.floor(newXPosition) + "px";
		mediaFitItem.domObject.style.top = Math.floor(newYPosition) + "px";	
	};


	/*
		instantiateListeners, doScroll, doResize
		-------------------------------------------------------------------------
		Scroll, resize, and timer events to fit & position mediaFits.
		-------------------------------------------------------------------------
	*/	
	var instantiateListeners = function() {
		window.onscroll = function() {
			if ( options.checkOnScroll ) {
				if (window.requestAnimationFrame) window.requestAnimationFrame(function() { doScroll() });
				else if (window.msRequestAnimationFrame) window.msRequestAnimationFrame(function() { doScroll() });
				else if (window.webkitRequestAnimationFrame) window.webkitRequestAnimationFrame(function() { doScroll() });
				else if (window.mozRequestAnimationFrame) window.mozRequestAnimationFrame(function() { doScroll() });
				else if (window.oRequestAnimationFrame) window.oRequestAnimationFrame(function() { doScroll() });
			}
			
			// If there were a prior scroll function set, do it
			if ( typeof oldScrollFunc === 'function' ) {
				oldScrollFunc();
			}	
		};

		window.addEventListener('resize', function() {
			clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
            	doResize();
            },150);
        });		
	};

	var doScroll = function() {
		scrolledTop = window.pageYOffset;
		collectMediaFits();
		setUnloadedOffsets();
		checkUnloadedMediaFits();
	};

	var doResize = function( runOldResize ) {
		runOldResize = ( typeof runOldResize == 'undefined' ) ? true : runOldResize;
		scrolledTop = window.pageYOffset;
		screenHeight = window.innerHeight;

		setUnloadedOffsets();
		checkUnloadedMediaFits();
		fitAllLoadedMedia();

		// If there were a prior resize function set, do it
		if ( runOldResize && typeof oldResizeFunc === 'function' ) {
			//oldResizeFunc();
		}	
	};


	var checkLoop = function() {
		currentTime = getTheTime();
		deltaTime = currentTime - previousTime; 
		if ( deltaTime > options.autoCheckInterval ) {
			previousTime = currentTime;
			scrolledTop = window.pageYOffset;

			collectMediaFits();
			setUnloadedOffsets();
			checkUnloadedMediaFits();
		}

		if ( options.autoCheck ) {
			requestNextCheck();
		}
	};


	var requestNextCheck = function() {
		if (window.requestAnimationFrame)
			window.requestAnimationFrame( checkLoop );
		else if (window.msRequestAnimationFrame)
			window.msRequestAnimationFrame( checkLoop );
		else if (window.webkitRequestAnimationFrame)
			window.webkitRequestAnimationFrame( checkLoop );
		else if (window.mozRequestAnimationFrame)
			window.mozRequestAnimationFrame( checkLoop );
		else if (window.oRequestAnimationFrame)
			window.oRequestAnimationFrame( checkLoop );
		else if (typeof window.requestNextFrame === 'undefined' )  {	
			window.requestNextFrame = setInterval(function() {
				checkLoop();
			},18);
		}
	};

	var getTheTime = function() {
		return parseInt(new Date().getTime());
	};


	/*
		fitAllLoadedMedia
		-------------------------------------------------------------------------
		Loop through loaded mediaFits to refit them inside their containers.
		-------------------------------------------------------------------------
	*/
	var fitAllLoadedMedia = function() {
		for ( var i = 0; i < loadedMediaFits.length; i++ ) {
			fitMedia(loadedMediaFits[i]);
		}
	};


	/*
		doMediaFit
		-------------------------------------------------------------------------
		Simple function to check the status of every mediaFit, load, or resize 
		-------------------------------------------------------------------------
	*/
	var doMediaFit = function() {
		collectMediaFits();
		checkUnloadedMediaFits();
		fitAllLoadedMedia();
	};


	/*
		isVisible
		-------------------------------------------------------------------------
		Determines if a particular mediaFit is visible.
		-------------------------------------------------------------------------
	*/
	var isVisible = function( domObj ) {
		if ( domObj.offsetWidth > 0 && domObj.offsetHeight > 0 ) {
			return true;
		}
		else {
			return false;
		}
	};


	/*
		withinView
		-------------------------------------------------------------------------
		Determines if a particular mediaFit is within the viewport of the screen.
		-------------------------------------------------------------------------
	*/
	var withinView = function( mediaFitItem ) {
		if ( (mediaFitItem.lazyLoad !== false && scrolledTop + screenHeight > mediaFitItem.domOffset - 350 && scrolledTop <= mediaFitItem.domOffset + mediaFitItem.parentDom.offsetHeight + 350 ) || mediaFitItem.lazyLoad === false ) {
			return true;
		} else {
			return false;
		}
	};


	/*
		addClass
		-------------------------------------------------------------------------
		Adds a class name to a dom element
		-------------------------------------------------------------------------
	*/
	var addClass = function( $domItem, className ) {
		removeClass($domItem, className);
		$domItem.className = $domItem.className.replace(/^\s\s*/g, '').replace(/\s\s*$/g, '').replace(/\s\s+/g, ' ') + " " + className;
	};

	
	/*
		removeClass
		-------------------------------------------------------------------------
		Removes the class name from a dom element
		-------------------------------------------------------------------------
	*/
	var removeClass = function( $domItem, className ) {
		$domItem.className = $domItem.className.replace(new RegExp(className, 'g'), '').replace(/^\s\s*/g, '').replace(/\s\s*$/g, '').replace(/\s\s+/g, ' ');
	};


	/*
		hasClass
		-------------------------------------------------------------------------
		Returns true/false if the dom element contains a class name
		-------------------------------------------------------------------------
	*/
	var hasClass = function( $domItem, className ) {
		var itemClasses = $domItem.className;
		var classList = itemClasses.replace(/^\s\s*/g, '').replace(/\s\s*$/g, '').replace(/\s\s+/g, ' ').split(' ');
		for ( var i = 0; i < classList.length; i++ ) {
			if ( classList[i] === className ) {
				return true;
			}
		}
		return false;
	};


	/*
		getPageOffset
		-------------------------------------------------------------------------
		Returns an element's offset position on the page
		-------------------------------------------------------------------------
	*/
	var getPageOffset = function(domObj) {
		var box = { top: 0, left: 0 };
		// BlackBerry 5, iOS 3 (original iPhone)
		if ( typeof domObj.getBoundingClientRect !== "undefined" ) {
		  box = domObj.getBoundingClientRect();
		}
		return 	{
		  top: box.top  + ( window.pageYOffset || domObj.scrollTop )  - ( domObj.clientTop  || 0 ),
		  left: box.left + ( window.pageXOffset || domObj.scrollLeft ) - ( domObj.clientLeft || 0 )
		};
	};


	/*
		getStyle
		-------------------------------------------------------------------------
		Returns a css value for a particular value such as 'block' or 'none' 
		-------------------------------------------------------------------------
	*/
	var getStyle = function(el, styleProp) {
		var value, defaultView = (el.ownerDocument || document).defaultView;
		// W3C standard way:
		if (defaultView && defaultView.getComputedStyle) {
			// sanitize property name to css notation
			// (hypen separated words eg. font-Size)
			styleProp = styleProp.replace(/([A-Z])/g, "-$1").toLowerCase();
			return defaultView.getComputedStyle(el, null).getPropertyValue(styleProp);
		} else if (el.currentStyle) { // IE
			// sanitize property name to camelCase
			styleProp = styleProp.replace(/\-(\w)/g, function(str, letter) {
				return letter.toUpperCase();
			});
			value = el.currentStyle[styleProp];
			// convert other units to pixels on IE
			if (/^\d+(em|pt|%|ex)?$/i.test(value)) { 
				return (function(value) {
					var oldLeft = el.style.left, oldRsLeft = el.runtimeStyle.left;
					el.runtimeStyle.left = el.currentStyle.left;
					el.style.left = value || 0;
					value = el.style.pixelLeft + "px";
					el.style.left = oldLeft;
					el.runtimeStyle.left = oldRsLeft;
					return value;
				})(value);
			}
			return value;
		}
	};


	/*
		isInitialized
		-------------------------------------------------------------------------
		Returns whether or not mediaFit was already initialized
		-------------------------------------------------------------------------
	*/
	var isInitialized = function() {
		return initialized;
	};


	return {
		init: init,
		checkUnloadedMediaFits : checkUnloadedMediaFits,
		doMediaFit : doMediaFit,
		isInitialized : isInitialized
	};
})();

(function(funcName, baseObj) {
    // The public function name defaults to window.docReady
    // but you can pass in your own object and own function name and those will be used
    // if you want to put them in a different namespace
    funcName = funcName || "docReady";
    baseObj = baseObj || window;
    var readyList = [];
    var readyFired = false;
    var readyEventHandlersInstalled = false;

    // call this when the document is ready
    // this function protects itself against being called more than once
    function ready() {
        if (!readyFired) {
            // this must be set to true before we start calling callbacks
            readyFired = true;
            for (var i = 0; i < readyList.length; i++) {
                // if a callback here happens to add new ready handlers,
                // the docReady() function will see that it already fired
                // and will schedule the callback to run right after
                // this event loop finishes so all handlers will still execute
                // in order and no new ones will be added to the readyList
                // while we are processing the list
                readyList[i].fn.call(window, readyList[i].ctx);
            }
            // allow any closures held by these functions to free
            readyList = [];
        }
    }

    function readyStateChange() {
        if ( document.readyState === "complete" ) {
            ready();
        }
    }

    // This is the one public interface
    // docReady(fn, context);
    // the context argument is optional - if present, it will be passed
    // as an argument to the callback
    baseObj[funcName] = function(callback, context) {
        if (typeof callback !== "function") {
            throw new TypeError("callback for docReady(fn) must be a function");
        }
        // if ready has already fired, then just schedule the callback
        // to fire asynchronously, but right away
        if (readyFired) {
            setTimeout(function() {callback(context);}, 1);
            return;
        } else {
            // add the function and context to the list
            readyList.push({fn: callback, ctx: context});
        }
        // if document already ready to go, schedule the ready function to run
        if (document.readyState === "complete") {
            setTimeout(ready, 1);
        } else if (!readyEventHandlersInstalled) {
            // otherwise if we don't have event handlers installed, install them
            if (document.addEventListener) {
                // first choice is DOMContentLoaded event
                document.addEventListener("DOMContentLoaded", ready, false);
                // backup is window load event
                window.addEventListener("load", ready, false);
            } else {
                // must be IE
                document.attachEvent("onreadystatechange", readyStateChange);
                window.attachEvent("onload", ready);
            }
            readyEventHandlersInstalled = true;
        }
    }
})("docIsReady", window);

docIsReady(function() {
	if ( mediaFit.isInitialized() == false ) {
		mediaFit.init();
	}
});

function doMediaFit() {
	mediaFit.doMediaFit();
}


