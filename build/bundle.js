var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    const seen_callbacks = new Set();
    function flush() {
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/Slider.svelte generated by Svelte v3.18.1 */

    function create_fragment(ctx) {
    	let input;
    	let dispose;

    	return {
    		c() {
    			input = element("input");
    			attr(input, "type", "range");
    			set_style(input, "--color", /*sliderColor*/ ctx[1]);
    			attr(input, "min", "0");
    			attr(input, "max", "255");
    			attr(input, "class", "slider svelte-1h46lon");
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*colorNumber*/ ctx[0]);

    			dispose = [
    				listen(input, "change", /*input_change_input_handler*/ ctx[3]),
    				listen(input, "input", /*input_change_input_handler*/ ctx[3])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*sliderColor*/ 2) {
    				set_style(input, "--color", /*sliderColor*/ ctx[1]);
    			}

    			if (dirty & /*colorNumber*/ 1) {
    				set_input_value(input, /*colorNumber*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(input);
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { colorNumber = 0 } = $$props;
    	let { sliderColor } = $$props;
    	const dispatch = createEventDispatcher();

    	function input_change_input_handler() {
    		colorNumber = to_number(this.value);
    		$$invalidate(0, colorNumber);
    	}

    	$$self.$set = $$props => {
    		if ("colorNumber" in $$props) $$invalidate(0, colorNumber = $$props.colorNumber);
    		if ("sliderColor" in $$props) $$invalidate(1, sliderColor = $$props.sliderColor);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*colorNumber*/ 1) {
    			 dispatch("color", colorNumber);
    		}
    	};

    	return [colorNumber, sliderColor, dispatch, input_change_input_handler];
    }

    class Slider extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { colorNumber: 0, sliderColor: 1 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.18.1 */

    function create_if_block(ctx) {
    	let section;
    	let h2;
    	let t1;
    	let pre;
    	let t2;

    	return {
    		c() {
    			section = element("section");
    			h2 = element("h2");
    			h2.textContent = "Error Message";
    			t1 = space();
    			pre = element("pre");
    			t2 = text(/*errorMessage*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, h2);
    			append(section, t1);
    			append(section, pre);
    			append(pre, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*errorMessage*/ 2) set_data(t2, /*errorMessage*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let main;
    	let h1;
    	let t1;
    	let h20;
    	let t3;
    	let p;
    	let t5;
    	let button;
    	let t7;
    	let br;
    	let t8;
    	let t9;
    	let t10;
    	let t11;
    	let section;
    	let t12;
    	let t13;
    	let h21;
    	let t15;
    	let img;
    	let img_src_value;
    	let current;
    	let dispose;

    	const slider0 = new Slider({
    			props: {
    				min: "0",
    				max: "0",
    				colorNumber: "50",
    				sliderColor: "#AA0000"
    			}
    		});

    	slider0.$on("color", /*updateRed*/ ctx[3]);

    	const slider1 = new Slider({
    			props: {
    				min: "0",
    				max: "0",
    				colorNumber: "0",
    				sliderColor: "#00AA00"
    			}
    		});

    	slider1.$on("color", /*updateGreen*/ ctx[5]);

    	const slider2 = new Slider({
    			props: {
    				min: "0",
    				max: "0",
    				colorNumber: "0",
    				sliderColor: "#0000AA"
    			}
    		});

    	slider2.$on("color", /*updateBlue*/ ctx[4]);
    	let if_block = /*showError*/ ctx[0] && create_if_block(ctx);

    	return {
    		c() {
    			main = element("main");
    			h1 = element("h1");
    			h1.textContent = "Arduino Color Picker";
    			t1 = space();
    			h20 = element("h2");

    			h20.innerHTML = `<a href="https://github.com/phptuts/arduino-svelte-color-picker">
      Click here for setup instructions
    </a>`;

    			t3 = space();
    			p = element("p");
    			p.textContent = "Besure experimental webplatorm features are enabled if you are using a\n    version of chrome under 80. Do this by going to this url in the browser:\n    chrome://flags.";
    			t5 = space();
    			button = element("button");
    			button.textContent = "Connect To Arduino";
    			t7 = space();
    			br = element("br");
    			t8 = space();
    			create_component(slider0.$$.fragment);
    			t9 = space();
    			create_component(slider1.$$.fragment);
    			t10 = space();
    			create_component(slider2.$$.fragment);
    			t11 = space();
    			section = element("section");
    			t12 = space();
    			if (if_block) if_block.c();
    			t13 = space();
    			h21 = element("h2");
    			h21.textContent = "Circuit Picture";
    			t15 = space();
    			img = element("img");
    			attr(button, "class", "svelte-1boe97w");
    			set_style(section, "background", /*colorCss*/ ctx[2]);
    			attr(section, "id", "color_picker");
    			attr(section, "class", "svelte-1boe97w");
    			if (img.src !== (img_src_value = "rgb_led.svg")) attr(img, "src", img_src_value);
    			attr(img, "alt", "picture of circuite");
    			attr(main, "class", "svelte-1boe97w");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, h1);
    			append(main, t1);
    			append(main, h20);
    			append(main, t3);
    			append(main, p);
    			append(main, t5);
    			append(main, button);
    			append(main, t7);
    			append(main, br);
    			append(main, t8);
    			mount_component(slider0, main, null);
    			append(main, t9);
    			mount_component(slider1, main, null);
    			append(main, t10);
    			mount_component(slider2, main, null);
    			append(main, t11);
    			append(main, section);
    			append(main, t12);
    			if (if_block) if_block.m(main, null);
    			append(main, t13);
    			append(main, h21);
    			append(main, t15);
    			append(main, img);
    			current = true;
    			dispose = listen(button, "click", /*connectUSB*/ ctx[6]);
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*colorCss*/ 4) {
    				set_style(section, "background", /*colorCss*/ ctx[2]);
    			}

    			if (/*showError*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(main, t13);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(slider0.$$.fragment, local);
    			transition_in(slider1.$$.fragment, local);
    			transition_in(slider2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(slider0.$$.fragment, local);
    			transition_out(slider1.$$.fragment, local);
    			transition_out(slider2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(slider0);
    			destroy_component(slider1);
    			destroy_component(slider2);
    			if (if_block) if_block.d();
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let redColor = 120;
    	let blueColor = 0;
    	let greenColor = 0;
    	let showError = false;
    	let errorMessage = "";
    	let writer;

    	function updateRed(e) {
    		$$invalidate(7, redColor = e.detail);
    	}

    	function updateBlue(e) {
    		$$invalidate(8, blueColor = e.detail);
    	}

    	function updateGreen(e) {
    		$$invalidate(9, greenColor = e.detail);
    	}

    	async function connectUSB() {
    		$$invalidate(0, showError = false);

    		try {
    			const port = await navigator.serial.requestPort();
    			await port.open({ baudrate: 115200 });
    			$$invalidate(10, writer = port.writable.getWriter());
    		} catch(e) {
    			$$invalidate(0, showError = true);
    			console.error(e);
    			$$invalidate(1, errorMessage = e.message);
    		}
    	}

    	let colorCss;
    	let arduinoColor;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*redColor, greenColor, blueColor*/ 896) {
    			 $$invalidate(2, colorCss = `rgb(${redColor}, ${greenColor}, ${blueColor})`);
    		}

    		if ($$self.$$.dirty & /*redColor, greenColor, blueColor*/ 896) {
    			 $$invalidate(11, arduinoColor = `${redColor}:${greenColor}:${blueColor}|`);
    		}

    		if ($$self.$$.dirty & /*writer, arduinoColor*/ 3072) {
    			 if (writer && arduinoColor) {
    				const enc = new TextEncoder(); // always utf-8
    				writer.write(enc.encode(arduinoColor));
    			}
    		}
    	};

    	return [
    		showError,
    		errorMessage,
    		colorCss,
    		updateRed,
    		updateBlue,
    		updateGreen,
    		connectUSB
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
