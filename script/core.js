
let ws = new WebSocket('ws://' + SERVER_IP_ADDRESS + ':' + SERVER_WEBSOCKET_PORT);

ws.binaryType = 'arraybuffer';
new_plot_id = 0;


function addTraceToPlot() {
    /* Add a trace to a given plot when this button is pressed. Unfortunately cannot make
       this a method of class Plot, because there is a conflict with the *this* keyword (used
       by both the button and the object instance */
    id = this.id.split('-')[1]

    var i = 0;

    for (i = 0; i < a_plots.length; i++) {
        if (a_plots[i].plot_id == id) {
            a_plots[i].addTrace();
        }
    }
}

function update_n_points() {
    id = this.id.split('-')[2];
    var i = 0;

    for (i = 0; i < a_plots.length; i++) {
        if (a_plots[i].plot_id == id) {
            a_plots[i].updateCountThresh();
        }
    }
}

function appendBuffer(buf1, buf2) {
    var tmp = new Float32Array(buf1.length + buf2.length);
    tmp.set(new Float32Array(buf1), 0);
    tmp.set(new Float32Array(buf2), buf1.length);
    return tmp;
}

// Simple FFT implementation
function fft(data) {
    const n = data.length;
    const m = Math.log2(n);
    if (Math.floor(m) !== m) throw "Data length must be power of 2";

    // Bit reversal
    let j = 0;
    const x = new Float32Array(n * 2); // Interleaved complex: [real0, imag0, real1, imag1, ...]
    for (let i = 0; i < n; i++) {
        x[i * 2] = data[i];
        x[i * 2 + 1] = 0;
    }

    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tr = x[i * 2];
            let ti = x[i * 2 + 1];
            x[i * 2] = x[j * 2];
            x[i * 2 + 1] = x[j * 2 + 1];
            x[j * 2] = tr;
            x[j * 2 + 1] = ti;
        }
        let k = n / 2;
        while (k <= j) {
            j -= k;
            k /= 2;
        }
        j += k;
    }

    // Butterfly
    let l = 1;
    let k = 1; // stage
    while (l < n) { // l is step size
        const step = l * 2;
        const w_re = Math.cos(Math.PI / l); // -PI/l for inverse, here forward is usually -2PI/N ? 
        // standard definition: W_N = e^(-i 2pi/N)
        // here we iterate. Let's stick to standard implementation
        const w_im = -Math.sin(Math.PI / l);

        let u_re = 1;
        let u_im = 0;

        for (let j = 0; j < l; j++) {
            for (let i = j; i < n; i += step) {
                const ip = i + l;
                const tr = x[ip * 2] * u_re - x[ip * 2 + 1] * u_im;
                const ti = x[ip * 2] * u_im + x[ip * 2 + 1] * u_re;

                x[ip * 2] = x[i * 2] - tr;
                x[ip * 2 + 1] = x[i * 2 + 1] - ti;
                x[i * 2] += tr;
                x[i * 2 + 1] += ti;
            }
            const t_re = u_re * w_re - u_im * w_im;
            u_im = u_re * w_im + u_im * w_re;
            u_re = t_re;
        }
        l = step;
    }

    // Magnitude
    const mags = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
        mags[i] = Math.sqrt(x[i * 2] * x[i * 2] + x[i * 2 + 1] * x[i * 2 + 1]);
    }
    return mags;
}

// Simple FFT implementation
function fft(data) {
    const n = data.length;
    const m = Math.log2(n);
    if (Math.floor(m) !== m) throw "Data length must be power of 2";

    // Bit reversal
    let j = 0;
    const x = new Float32Array(n * 2); // Interleaved complex: [real0, imag0, real1, imag1, ...]
    for (let i = 0; i < n; i++) {
        x[i * 2] = data[i];
        x[i * 2 + 1] = 0;
    }

    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tr = x[i * 2];
            let ti = x[i * 2 + 1];
            x[i * 2] = x[j * 2];
            x[i * 2 + 1] = x[j * 2 + 1];
            x[j * 2] = tr;
            x[j * 2 + 1] = ti;
        }
        let k = n / 2;
        while (k <= j) {
            j -= k;
            k /= 2;
        }
        j += k;
    }

    // Butterfly
    let l = 1;
    let k = 1; // stage
    while (l < n) { // l is step size
        const step = l * 2;
        const w_re = Math.cos(Math.PI / l);
        const w_im = -Math.sin(Math.PI / l);

        let u_re = 1;
        let u_im = 0;

        for (let j = 0; j < l; j++) {
            for (let i = j; i < n; i += step) {
                const ip = i + l;
                const tr = x[ip * 2] * u_re - x[ip * 2 + 1] * u_im;
                const ti = x[ip * 2] * u_im + x[ip * 2 + 1] * u_re;

                x[ip * 2] = x[i * 2] - tr;
                x[ip * 2 + 1] = x[i * 2 + 1] - ti;
                x[i * 2] += tr;
                x[i * 2 + 1] += ti;
            }
            const t_re = u_re * w_re - u_im * w_im;
            u_im = u_re * w_im + u_im * w_re;
            u_re = t_re;
        }
        l = step;
    }

    // Magnitude
    const mags = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
        mags[i] = Math.sqrt(x[i * 2] * x[i * 2] + x[i * 2 + 1] * x[i * 2 + 1]);
    }
    return mags;
}

class Plot {
    constructor(plot_type, plot_id, trace_options) {
        this.plot_type = plot_type;
        this.plot_id = plot_id;
        this.n_traces = 0;
        this.traces = [];

        this.plot_data = [];
        this.max_heatmap_len = 100;


        this.plotdata = [];

        this.plotlayout = {
            title: '',
            showlegend: true,
            legend: { "orientation": "h" }
            // paper_bgcolor: '#3b3838',
            // plot_bgcolor: '#3b3838'
        };

        this.plot_div = document.createElement("div");
        this.plot_div.id = "plot-div-" + plot_id;
        this.plot_div.classList.add("plot-container-upper");

        this.plot_section = document.createElement("div");
        this.plot_section.id = "plot-" + plot_id;

        this.plot_config = document.createElement("div");
        this.plot_config.id = "plot-config-" + plot_id;
        this.plot_config.classList.add("plot-config");

        this.plot_selection = document.createElement("select");
        this.plot_selection.id = "dropdown-" + plot_id;
        this.plot_selection.classList.add("dropdown-traces");

        for (const trace of trace_options) {
            var option = document.createElement("option");
            option.class = "dropdown-option";
            option.value = trace.split(" ");
            option.text = trace;
            this.plot_selection.appendChild(option);
        }

        this.add_trace = document.createElement("button");
        this.add_trace.classList.add("add-trace");
        this.add_trace.type = 'button';
        this.add_trace.innerHTML = 'Add trace';
        this.add_trace.id = "button-" + plot_id;
        this.add_trace.onclick = addTraceToPlot;

        this.element = document.getElementById("plots");

        this.n_points_per_update_select = document.createElement("select");
        this.n_points_per_update_select.id = "dropdown-npoints-" + plot_id;
        this.n_points_per_update_select.classList.add("dropdown-traces");
        var n_point_opts = [1, 10, 50, 100, 500, 1000];
        for (const n_point of n_point_opts) {
            var option = document.createElement("option");
            if (n_point == 10) {
                option.selected = "selected";
            }
            option.classList.add("dropdown-option");
            option.value = n_point
            option.text = n_point;
            this.n_points_per_update_select.appendChild(option);
        }
        this.n_points_per_update_select.onchange = update_n_points;

        // Y-Axis Selection Dropdown
        this.yaxis_selection = document.createElement("select");
        this.yaxis_selection.id = "dropdown-yaxis-" + plot_id;
        this.yaxis_selection.classList.add("dropdown-traces");

        // Default Option
        var default_opt = document.createElement("option");
        default_opt.value = "";
        default_opt.text = "Y-Axis: Index";
        this.yaxis_selection.appendChild(default_opt);

        for (const trace of trace_options) {
            var option = document.createElement("option");
            option.class = "dropdown-option";
            option.value = trace.split(" ");
            option.text = "Y-Axis: " + trace;
            this.yaxis_selection.appendChild(option);
        }

        this.plot_div.appendChild(this.plot_section);
        this.plot_config.appendChild(this.plot_selection);
        this.plot_config.appendChild(this.yaxis_selection); // Add Y-Axis dropdown
        this.plot_config.appendChild(this.add_trace);
        this.n_points_update_div = document.createElement("div");
        this.n_points_update_div.id = "npoints-div-" + plot_id;
        this.n_points_update_div.classList.add("dropdown-traces");
        this.n_points_update_div.innerHTML = 'Update rate: ';
        this.n_points_update_div.appendChild(this.n_points_per_update_select);
        this.plot_config.appendChild(this.n_points_update_div)

        // Log Scale Y Checkbox
        this.log_scale_y_div = document.createElement("div");
        this.log_scale_y_div.classList.add("dropdown-traces");

        this.log_scale_y_checkbox = document.createElement("input");
        this.log_scale_y_checkbox.type = "checkbox";
        this.log_scale_y_checkbox.id = "checkbox-log-y-" + plot_id;
        this.log_scale_y_checkbox.checked = false;
        this.log_scale_y_checkbox.onchange = () => this.toggleLogScaleY();

        var label = document.createElement("label");
        label.htmlFor = "checkbox-log-y-" + plot_id;
        label.appendChild(document.createTextNode("Log Y-Axis"));

        this.log_scale_y_div.appendChild(this.log_scale_y_checkbox);
        this.log_scale_y_div.appendChild(label);
        this.plot_config.appendChild(this.log_scale_y_div);

        this.plot_div.appendChild(this.plot_config);
        this.element.appendChild(this.plot_div);

        /* Update this for each datapoitn added to the plot, before the plot operation is called */
        this.data_added_since_plot = 0;
        this.update_count_thresh = 10;
        this.indices = [];
        this.epoch_ms = [];
        this.last_data = null;
        this.time_len_secs = 5;
        this.b_relayout = false;
        this.b_trigger_relayout = false;
        var config = { 'responsive': true };
        Plotly.newPlot('plot-' + this.plot_id, this.plotdata, this.plotlayout, config);
    }

    updateCountThresh() {
        var dropdown = document.getElementById("dropdown-npoints-" + this.plot_id);
        this.update_count_thresh = dropdown.value;
    }

    toggleLogScaleY() {
        var type = this.log_scale_y_checkbox.checked ? 'log' : 'linear';
        Plotly.relayout('plot-' + this.plot_id, { 'yaxis.type': type });
    }

    resetTraces() {
        var trace;
        this.plot_data = [];
        this.epoch_ms = [];
        for (trace of this.traces) {
            if (this.plot_type == "heatmap" || this.plot_type == "spectrogram") {
                this.plot_data.push([]);
            }
            else if (this.plot_type == "scatter") {
                // Scatter plots use ArrayBuffers as the type
                this.plot_data.push(new Float32Array(new ArrayBuffer([])))
            }
            this.indices.push(this.n_traces);
            this.epoch_ms.push([])
        }
        this.b_relayout = false;
        this.b_trigger_relayout = false;
    }
    addTrace() {
        var dropdown = document.getElementById("dropdown-" + id);
        var yaxis_dropdown = document.getElementById("dropdown-yaxis-" + id);
        var trace_obj = { name: dropdown.value };

        // Store selected Y-axis variable
        var yaxis_var = yaxis_dropdown.value;

        if (this.plot_type == 'heatmap') {
            trace_obj.type = 'heatmap';
            trace_obj.z = [];
            trace_obj.transpose = true;
            trace_obj.y = [];
        } else {
            trace_obj.type = 'scatter';
            trace_obj.y = [];
        }

        // Store custom y-axis variable in Plotly trace meta or similar, 
        // but easier to store in our own structure or just use logic in addData
        // We can add it to 'traces' array? 
        // 'traces' currently stores just the name string.
        // Let's change 'traces' to store objects or parallel array.
        // For minimal impact, let's keep traces as is and add a parallel array 'yaxis_traces'.
        if (!this.yaxis_traces) this.yaxis_traces = [];
        this.yaxis_traces.push(yaxis_var);

        Plotly.addTraces('plot-' + this.plot_id, trace_obj);
        this.traces.push(dropdown.value);
        this.resetTraces();
        this.epoch_ms.push([])
        this.n_traces = this.n_traces + 1;
    }

    addData(in_data, epoch_ms) {
        // This only works for 1D data (for scatter plots) or a single element list of 1D data (for heatmaps or other 2D data)        
        var index = 0;
        var trace;
        var trace_idx = 0;

        if (in_data == null) {
            in_data = this.last_data;
        }
        this.last_data = in_data;

        for (trace of this.traces) {
            var data;
            var scope;
            var scopes = trace.split('.');
            var this_var = in_data[scopes[0]];
            for (scope of scopes.slice(1)) {
                this_var = this_var[scope];
            }

            // For heatmaps, assemble a list of 1D arrays. Otherwise, append the array buffers.
            if (this.plot_type == "heatmap") {
                // this_var[0] is the data array
                var row_data = this_var[0];

                if (row_data.length && typeof row_data.map === 'function') {
                    row_data = Array.from(row_data);
                }

                this.plot_data[trace_idx].push(row_data);
                this.epoch_ms[trace_idx].push(epoch_ms);

                // Check for frequency axis data (expected in 'frequencies' field of the node)
                // We assume 'in_data' is the node object. 'this_var' is selected by dropdown.
                // If the dropdown selected "audio_data.magnitude", then 'in_data' is "audio_data".
                // BUT, 'this_var' is resolved from 'in_data' using 'trace'.
                // The 'trace' string is like "audio_data.magnitude".
                // So we can try to find "frequencies" sibling.

                // Ideally, we look at the root object or know where to find context.
                // Simplification: if 'frequencies' exists in 'in_data', use it.
                // Better: if 'frequencies' exists in the SAME object as 'this_var'came from?
                // Let's check 'in_data' keys if they contain 'frequencies'.
                // Actually, 'in_data' structure depends on blob.
                // If blob is: { audio_data: { magnitude: [...], frequencies: [...] } }
                // And user selects "audio_data.magnitude".
                // Then 'in_data' passed to addData is the root object? No, addData calls propertiesToArray on 'out'.
                // 'out' is the whole object. 'addData' receives 'out'.
                // So 'in_data' IS the root object.

                // Check for frequency axis data
                // 'in_data' is the object containing the trace data
                // Priority: 
                // 1. User selected Y-axis variable
                // 2. Fallback to 'frequencies' sibling if exists (legacy/auto behavior)
                // 3. Index (default)

                var parent_obj = in_data;
                var yaxis_var = (this.yaxis_traces && this.yaxis_traces[trace_idx]) ? this.yaxis_traces[trace_idx] : null;
                var target_y_data = null;

                if (yaxis_var) {
                    // Resolve user selected Y-axis variable
                    var split_yaxis = yaxis_var.split(".");
                    var y_obj = in_data;
                    for (var k of split_yaxis) {
                        if (y_obj[k]) y_obj = y_obj[k];
                        else { y_obj = null; break; }
                    }
                    if (y_obj) target_y_data = y_obj[0]; // Blob arrays wrapped in list
                } else {
                    // Fallback: Look for 'frequencies' sibling
                    var split_trace = trace.split(".");
                    var p_obj = in_data;
                    if (split_trace.length > 1) {
                        var parent_scope = split_trace.slice(0, -1);
                        for (var k of parent_scope) {
                            if (p_obj[k]) p_obj = p_obj[k];
                            else { p_obj = null; break; }
                        }
                    } else {
                        // Top-level trace, parent is root
                        p_obj = in_data;
                    }

                    if (p_obj && p_obj.frequencies) {
                        target_y_data = p_obj.frequencies[0];
                    }
                }

                if (target_y_data && target_y_data.length) {
                    Plotly.restyle('plot-' + this.plot_id, { y: [Array.from(target_y_data)] }, [trace_idx]);
                }

                // Limit heatmap length
                if (this.plot_data[trace_idx].length > this.max_heatmap_len) {
                    this.plot_data[trace_idx].shift();
                }
            }
            else {
                this.plot_data[trace_idx] = appendBuffer(this.plot_data[trace_idx], this_var[0])
                for (let samp of this_var[0]) {
                    this.epoch_ms[trace_idx].push(epoch_ms)
                }
            }

            index = index + 1;
            trace_idx = trace_idx + 1;
        }

        this.data_added_since_plot = this.data_added_since_plot + 1;
        if (this.data_added_since_plot >= this.update_count_thresh) {
            this.plot()
        }
    }

    plot() {
        var indices = [];
        var trace;
        var i = 0;

        var epoch;

        for (trace of this.plot_data) {
            indices.push(i);
            i = i + 1;
        }
        if (this.plot_data.length > 0) {
            if (this.plot_type == 'heatmap' || this.plot_type == 'spectrogram') {
                Plotly.restyle('plot-' + this.plot_id, { z: [...this.plot_data] }, indices)

                if (this.plot_data.length >= this.plot_len && this.plot_type != 'spectrogram') {
                    this.plot_data = this.plot_data.slice(1);
                }
            }
            else {
                // if (this.b_trigger_relayout)
                // {
                //     Plotly.relayout('plot-' + this.plot_id, {'xaxis.range': [-1000 * this.time_len_secs, 0]});
                //     this.b_relayout = true;
                //     this.b_trigger_relayout = false;
                // }
                // else if (!this.b_relayout)
                // {
                //     Plotly.relayout('plot-' + this.plot_id, {'xaxis.range': [epoch_adj[0], 0]})
                // }

                let trace;

                var i = 0;
                for (trace of this.traces) {
                    var epoch_adj = [];
                    /* Reference to 0 epoch. Latest sample should be 0-time */
                    for (epoch of this.epoch_ms[i]) {
                        var diff = epoch - this.epoch_ms[i][this.epoch_ms[i].length - 1];
                        epoch_adj.push(diff);
                        if (diff <= -this.time_len_secs * 1000 & !this.b_relayout) {
                            this.b_trigger_relayout = true;
                        }
                    }

                    /* Remove elements while time since the recently added point is greater than this.time_len
                       Dont need while loop here if using findLastIndex */
                    var remove_idx = 0;
                    while (remove_idx >= 0) {
                        const is_outside_range = (epoch_ms) => epoch_ms < -1000 * this.time_len_secs;
                        remove_idx = epoch_adj.findLastIndex(is_outside_range);
                        if (remove_idx != -1) {
                            epoch_adj = epoch_adj.slice(remove_idx + 1);
                            this.epoch_ms[i] = this.epoch_ms[i].slice(remove_idx + 1);
                            this.plot_data[i] = this.plot_data[i].slice(remove_idx + 1);
                        }
                    }
                    Plotly.restyle('plot-' + this.plot_id, { y: this.plot_data }, indices);
                    // Plotly.restyle('plot-' + this.plot_id, {y: this.plot_data, x: [epoch_adj]}, indices);
                    i += 1;
                }
            }
        }
        this.data_added_since_plot = 0;
    }
}

function addPlot() {
    var plot_type = document.getElementById("plot-type-select");
    var ip_addr_dropdown = document.getElementById("plot-ip-address");

    if (!(ip_addr_dropdown.value)) {
        console.log("No data is streaming yet");
        return;
    }
    a_plots[new_plot_id] = new Plot(plot_type.value, new_plot_id, ip_options[ip_addr_dropdown.value]);
    a_plot_device_ip[new_plot_id] = ip_addr_dropdown.value;
    new_plot_id = new_plot_id + 1;
}

function propertiesToArray(obj) {
    const isObject = val =>
        val && typeof val === 'object' && !Array.isArray(val);

    const addDelimiter = (a, b) =>
        a ? `${a}.${b}` : b;

    const paths = (obj = {}, head = '') => {
        return Object.entries(obj)
            .reduce((product, [key, value]) => {
                let fullPath = addDelimiter(head, key)
                return isObject(value) ?
                    product.concat(paths(value, fullPath))
                    : product.concat(fullPath)
            }, []);
    }

    return paths(obj);
}

function toggleSynchronisation() {
    var cb = document.getElementById("checkbox-synchronise");
    b_synchronise = cb.checked;
}


var b_discovered = false;
var a_plots = [];
var a_plot_device_ip = [];
var ip_options = {};
var b_synchronise = 0;
const start_time = new Date();
// message received - show the message in div#messages
ws.onmessage = function (event) {
    var rcv_time = new Date();
    let dv = new DataView(event.data);
    var ip_addr;
    var trace_options;

    [buffer, ip_addr] = readString(dv.buffer);
    [buffer, out, nodename] = blobDecode(buffer);
    root = {};
    root[nodename] = out;


    if (!(ip_addr in ip_options)) {
        /* Add the IP address option to the global dropdown */
        /* For now, multiple devices from the same IP are not supported */
        var ip_dropdown = document.getElementById("plot-ip-address");
        var option = document.createElement("option");
        option.classList.add("dropdown-option");
        option.value = ip_addr;
        option.text = ip_addr;
        ip_dropdown.appendChild(option);

        trace_options = propertiesToArray(out);
        ip_options[ip_addr] = trace_options;
    }

    for (plot_idx = 0; plot_idx < a_plots.length; plot_idx++) {
        /* only add data to the plot if the IP address matches */
        if (a_plot_device_ip[plot_idx] == ip_addr) {
            a_plots[plot_idx].addData(out, rcv_time - start_time);
        }
        else if (b_synchronise) {
            /* Repeat the last plot value but at the current timestamp */
            a_plots[plot_idx].addData(null, rcv_time - start_time);
        }
    }
};

ws.onopen = function () {
    console.log('WebSocket Client is has connected foo bah.');
};





