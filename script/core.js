let ws = new WebSocket('ws://192.168.50.115:8000');
ws.binaryType = 'arraybuffer';
new_plot_id = 0;


function addTraceToPlot()
{
    /* Add a trace to a given plot when this button is pressed. Unfortunately cannot make
       this a method of class Plot, because there is a conflict with the *this* keyword (used
       by both the button and the object instance */
    id = this.id.split('-')[1]

    var i = 0;

    for (i=0; i<a_plots.length; i++)
    {
        if (a_plots[i].plot_id == id)
        {
            a_plots[i].addTrace();
        }
    } 
}

function update_n_points()
{
    id = this.id.split('-')[2];
    var i = 0;

    for (i=0; i<a_plots.length; i++)
    {
        if (a_plots[i].plot_id == id)
        {
            a_plots[i].updateCountThresh();
        }
    }
}

function appendBuffer(buf1, buf2)
{
    var tmp = new Uint8Array(buf1.byteLength + buf2.byteLength);
    tmp.set(new Uint8Array(buf1), 0);
    tmp.set(new Uint8Array(buf2), buf1.byteLength);
    return tmp;
}

class Plot
{
    constructor(plot_type, plot_id, trace_options)
    {
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
            legend: {"orientation": "h"}
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

        for (const trace of trace_options)
        {
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
        for (const n_point of n_point_opts)
        {
            var option = document.createElement("option");
            if (n_point == 10)
            {
                option.selected = "selected";
            }
            option.classList.add("dropdown-option");
            option.value = n_point
            option.text = n_point;
            this.n_points_per_update_select.appendChild(option);
        }
        this.n_points_per_update_select.onchange = update_n_points;
        this.plot_div.appendChild(this.plot_section);
        this.plot_config.appendChild(this.plot_selection);
        this.plot_config.appendChild(this.add_trace);
        this.n_points_update_div = document.createElement("div");
        this.n_points_update_div.id = "npoints-div-" + plot_id;
        this.n_points_update_div.classList.add("dropdown-traces");
        this.n_points_update_div.innerHTML = 'Update rate: ';
        this.n_points_update_div.appendChild(this.n_points_per_update_select);
        this.plot_config.appendChild(this.n_points_update_div)
        this.plot_div.appendChild(this.plot_config);
        this.element.appendChild(this.plot_div);
        
        /* Update this for each datapoitn added to the plot, before the plot operation is called */
        this.data_added_since_plot = 0;
        this.update_count_thresh = 10;
        this.indices = [];
        this.epoch_ms = [];
        this.last_data = null;
        this.time_len_secs = 10;
        this.b_relayout = false;
        this.b_trigger_relayout = false;
        var config = {'responsive': true};
        Plotly.newPlot('plot-' + this.plot_id, this.plotdata, this.plotlayout, config);
    }

    updateCountThresh()
    {
        var dropdown = document.getElementById("dropdown-npoints-" + this.plot_id);
        this.update_count_thresh = dropdown.value;
    }

    resetTraces()
    {
        var trace;
        this.plot_data = [];
        this.epoch_ms = [];
        for (trace of this.traces)
        {
            this.plot_data.push([]);
            this.indices.push(this.n_traces);
        }
        this.b_relayout = false;
        this.b_trigger_relayout = false;
    }
    addTrace()
    {
        var dropdown = document.getElementById("dropdown-" + id);
        Plotly.addTraces('plot-' + this.plot_id, {y: [], name: dropdown.value});
        this.traces.push(dropdown.value);
        this.resetTraces();
        this.n_traces = this.n_traces + 1;
    }

    addData(in_data, epoch_ms)
    {
        var index = 0;
        var trace;
        var trace_idx = 0;
        // Populate the new sample with a repeat of the last sample
        if (in_data == null)
        {
            in_data = this.last_data;
        }
        this.last_data = in_data;
        
        for (trace of this.traces)
        {
            var data;
            var scope;
            var scopes = trace.split('.');
            var this_var = in_data[scopes[0]];
            for (scope of scopes.slice(1))
            {
                this_var = this_var[scope];
            }
            if (this.plot_type == 'scatter')
            {
                //data = this_var[0][0];
                //this.plot_data[trace_idx].push(data);
                var plot_data, ele;
                var i=this_var[0].length-1;
                data = this_var[0];
                
                var epoch_step_ms;
                
                if (this.epoch_ms.length > 0)
                {
                    var last_epoch = this.epoch_ms[this.epoch_ms.length-1];
                    epoch_step_ms = (last_epoch - epoch_ms) / this.epoch_ms.length;
                }
                else
                {
                    epoch_step_ms = 1;
                }
                
                for (ele of data)
                {
                    this.plot_data[trace_idx].push(ele);
                    this.epoch_ms.push(epoch_ms - i * epoch_step_ms)
                    i=i-1;
                }
            }
            else if (this.plot_type == 'heatmap')
            {
                data = this_var[0];
                this.plot_data[trace_idx].push(data);
                this.epoch_ms.push(epoch_ms);
            }
            index = index + 1;
            trace_idx = trace_idx + 1;
        }
        
        if (this.traces.length > 0)
        {
            this.data_added_since_plot = this.data_added_since_plot + 1;
            if (this.data_added_since_plot >= this.update_count_thresh)
            {
                this.plot()
            }
        }
    }

    plot()
    {
        var indices = [];
        var trace;
        var i = 0;
        var epoch_adj = [];
        var epoch;
        /* Reference to 0 epoch. Latest sample should be 0-time */
        for (epoch of this.epoch_ms)
        {
            var diff = epoch - this.epoch_ms[this.epoch_ms.length - 1];
            epoch_adj.push(diff);
            if (diff <= -this.time_len_secs * 1000 & !this.b_relayout)
            {
                this.b_trigger_relayout = true;
            }
        }
        for (trace of this.plot_data)
        {
            indices.push(i);
            i = i + 1;
        }
        if (this.plot_data.length > 0)
        {
            if (this.plot_type == 'heatmap')
            {
                Plotly.restyle('plot-' + this.plot_id, {z: [...this.plot_data]}, indices)

                if (this.plot_data.length >= this.plot_len)
                {
                    this.plot_data = this.plot_data.slice(1);
                }
            }
            else
            {
                if (this.b_trigger_relayout)
                {
                    Plotly.relayout('plot-' + this.plot_id, {'xaxis.range': [-1000 * this.time_len_secs, 0]});
                    this.b_relayout = true;
                    this.b_trigger_relayout = false;
                }
                else if (!this.b_relayout)
                {
                    Plotly.relayout('plot-' + this.plot_id, {'xaxis.range': [epoch_adj[0], 0]})
                }
                
                let trace;

                /* Remove elements while time since the recently added point is greater than this.time_len */
                var remove_idx = 0;
                while (remove_idx >= 0)
                {
                    const is_outside_range = (epoch_ms) => epoch_ms < -1000 * this.time_len_secs;
                    remove_idx = epoch_adj.findLastIndex(is_outside_range);
                    if (remove_idx != -1)
                    {
                        var i = 0;
                        epoch_adj.splice(0, remove_idx+1);
                        this.epoch_ms.splice(0, remove_idx+1);
                        for (trace of this.traces)
                        {
                            this.plot_data[i].splice(0, remove_idx+1);
                            i += 1;
                        }
                    }
                }
                
                    
        
                Plotly.restyle('plot-' + this.plot_id, {y: this.plot_data, x: [epoch_adj]}, indices);
            }
        }
        this.data_added_since_plot = 0;
    }
}

function addPlot()
{
    var plot_type = document.getElementById("plot-type-select");
    var ip_addr_dropdown = document.getElementById("plot-ip-address");
    
    if (!(ip_addr_dropdown.value))
    {
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
        .reduce((product, [key, value]) => 
          {
            let fullPath = addDelimiter(head, key)
            return isObject(value) ?
              product.concat(paths(value, fullPath))
            : product.concat(fullPath)
          }, []);
    }
  
    return paths(obj);
}

function toggleSynchronisation()
{
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
ws.onmessage = function(event) {
    var rcv_time = new Date();
    let dv = new DataView(event.data);
    var ip_addr;
    var trace_options;
    
    [buffer, ip_addr] = readString(dv.buffer);
    [buffer, out, nodename] = blobDecode(buffer);
    root = {};
    root[nodename] = out;

    
    if (!(ip_addr in ip_options))
    {
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
    
    for (plot_idx=0; plot_idx<a_plots.length; plot_idx++)
    {
        /* only add data to the plot if the IP address matches */
        if (a_plot_device_ip[plot_idx] == ip_addr)
        {
            a_plots[plot_idx].addData(out, rcv_time - start_time);
        }
        else if (b_synchronise)
        {
            /* Repeat the last plot value but at the current timestamp */
            a_plots[plot_idx].addData(null, rcv_time - start_time);
        }
    }
};

ws.onopen = function() {
    console.log('WebSocket Client is has connected foo bah.');
};





