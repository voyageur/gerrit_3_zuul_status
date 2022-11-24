// Copyright 2018 Michel Peterson
// Copyright 2019-2020 Radosław Piliszek
// Copyright 2020 Balazs Gibizer
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Original work by Michel: https://opendev.org/x/coats/src/commit/444c95738677593dcfed0cfd9667d4c4f0d596a3/coats/openstack_gerrit_zuul_status.user.js
// Original work by Balazs: https://gist.github.com/gibizer/717e0cb5b0da0d60d5ecf1e18c0c171a/480a7d3e25919292a772bc2a68a5d701e1e7e772
//
// ==UserScript==
// @name     Gerrit 3 Zuul Status
// @author   Michel Peterson
// @author   Radosław Piliszek
// @author   Balazs Gibizer
// @version  9.0.0
// @grant    none
// @include  https://review.opendev.org/*
// ==/UserScript==

// NOTE(yoctozepto): This is not the most robust script I have ever written but it gets the job done.
// Proper implementation would be Gerrit-side.
// I hope you find this useful before that happens.
// Do note a few queries (I observed max 2) might result in no rendering due to bad timing.

const zuul_status_base = "https://zuul.opendev.org/";
const refreshSpacing = 10000;

function render(jobs) {
    let table = "<table id=\"my-zuul-table\"><tbody>" +
      "<tr>" +
      "<th>Zuul check</th>" +
      "<th>Still running</th>" +
      "</tr>";

    for (const job of jobs) {
        let color;
        if (job.status === 'queued') {
            color = 'cornflowerblue';
        } else if (job.status === 'running') {
            color = 'orange';
        } else if (job.status === 'success') {
            color = 'green';
        } else {
            color = 'red';
        }
        const status_with_completeness = ((job.status === "running" && typeof job.completeness !== "undefined") ? "RUNNING (" + job.completeness + ")" : job.status.toUpperCase());
        const voting = job.voting ? "" : "<span style=\"font-size: small;\">&nbsp;(non-voting)</span>";

        table += "<tr>" +
      "<td><a href=\"" + job.url + "\" rel=\"nofollow\" style=\"display: inline\">" + job.name + "</a>" + voting + "</td>" +
      "<td><span style=\"color: " + color +";\">" + status_with_completeness + "</span></td>" +
      "</tr>";
    }

    table += "</tbody></table>";

    return table;
};

function refreshZuulStatus (toWhere) {
    const url = location.href;
    // an example url: https://review.opendev.org/c/openstack/kolla-ansible/+/696841/133
    const matches_url = /\/c\/([^/]+)\/([^/]+)\/\+\/(\d+)(?:\/(\d+))?$/.exec(url);
    if (!matches_url) {
        console.log('matches_url not match - skipping refresh');
        return;
    }

    const tenant_id = matches_url[1];
    const project_id = matches_url[2];
    const change_id = matches_url[3];
    let change_ver = matches_url[4];

    const zuul_status_url = zuul_status_base + "api/tenant/" + tenant_id + "/status/change/";
    const zuul_console_url = zuul_status_base + "t/" + tenant_id + "/";

    if (typeof change_ver === "undefined") {
        const downloadAnchor = document.getElementById('app')
                                       .shadowRoot
                                       .getElementById('app-element')
                                       .shadowRoot
                                       .querySelector('main')
                                       .querySelector('gr-change-view')
                                       .shadowRoot
                                       .getElementById('downloadDialog')
                                       .shadowRoot
                                       .getElementById('download');
        const downloadLink = downloadAnchor.href;
        // an example link: https://review.opendev.org/changes/openstack%2Fkolla-ansible~696841/revisions/134/patch?download
        const patchMatch = /revisions\/(\d+)\/patch/.exec(downloadLink);
        if (!patchMatch) {
            console.error('patchMatch not match - this is an error in assumptions');
            return;
        }
        change_ver = patchMatch[1];
    }

    const status_url = zuul_status_url + change_id + "," + change_ver;
    console.log('Zuul Status querying ' + status_url);

    fetch(status_url).then(response => response.json()).then(data => {
        console.log('Zuul Status queried ' + status_url);

        const jobs = [];

        for (const item of data) {
            for (const job of item.jobs) {
                const item = {};

                item.status = job.result ? job.result.toLowerCase() : (job.url ? "running" : "queued");
                item.name = job.name;
                item.voting = job.voting;
                item.pipeline = job.pipeline;
                item.url = job.result ? job.report_url : (job.url ? zuul_console_url + job.url : "#");

                if (item.status === "running" && job.remaining_time !== null) {
                    item.completeness = Math.round(100 * (job.elapsed_time / (job.elapsed_time + job.remaining_time))) + "%";
                }

                jobs.push(item);
            }
        }

        const existingTableParent = toWhere.querySelector('#my-zuul-table-parent');

        // there might be no jobs pending, only some dep records (items_behind, items_after)
        if (jobs.length > 0) {
            const html = render(jobs);
            if (existingTableParent) {
                existingTableParent.innerHTML = html;
            } else {
                const elem = document.createElement('div');
                elem.id = 'my-zuul-table-parent';
                elem.innerHTML = html;
                toWhere.appendChild(elem);
            }
        } else {
            console.log('Zuul Status found no jobs in ' + status_url);
            if (existingTableParent) {
                existingTableParent.parentElement.removeChild(existingTableParent);
            }
        }

        setTimeout(function () { refreshZuulStatus(toWhere) }, refreshSpacing);
    });
}

const get_place_to_insert_ci_table = function(){
    var gr_app = document.getElementsByTagName('gr-app')[0];
    var gr_app_element = gr_app.shadowRoot.querySelector(
        'gr-app-element');
    var gr_change_view = gr_app_element.shadowRoot.querySelector(
        'gr-change-view');
    var gr_related_changes_list = gr_change_view.shadowRoot.querySelector(
        'gr-related-changes-list');
    // if there are no related changes then this node is hidden, but we
    // need to make it visible so that the CI table become visible
    gr_related_changes_list.removeAttribute('hidden');
    gr_related_changes_list.removeAttribute('class');
    var gr_endpoint_decorator = gr_related_changes_list.shadowRoot.querySelector(
        'gr-endpoint-decorator');
    return gr_endpoint_decorator;
}

const get_ci_table = function(zuul_message){
    var lines = zuul_message.split('- ');

    var table = document.createElement('table');

    // table header
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    var result = lines[0].split('.')[0];
    td.appendChild(document.createTextNode(result));
    if (result.includes('succ')){
        td.style.color = 'green';
    }
    if (result.includes('fail')){
        td.style.color = 'red';
    }
    tr.appendChild(td);
    tr.appendChild(document.createElement('td'));
    table.appendChild(tr);

    for (var i=1; i<lines.length; i++){
        var fields = lines[i].split(': ');
        var job_name = fields[0].split(' ')[0];
        var job_link = fields[0].split(' ')[1];
        var job_result = fields[1];

        tr = document.createElement('tr');

        var td1 = document.createElement('td');
        var link_text = document.createTextNode(job_name);
        var a = document.createElement('a')
        a.href = job_link;
        a.title = job_name;
        a.appendChild(link_text);
        td1.appendChild(a);
        tr.appendChild(td1);

        var td2 = document.createElement('td');
        a = document.createElement('a')
        a.href = job_link;
        a.title = job_name;
        link_text = document.createTextNode(job_result);
        a.appendChild(link_text);
        td2.appendChild(a);

        if (job_result.includes('SUCCESS')){
            a.style.color = 'green';
        }
        if (job_result.includes('FAILURE')){
            a.style.color = 'red';
        }
        if (job_result.includes('POST_FAILURE')){
            a.style.color = 'orange';
        }
        if (job_result.includes('TIMED_OUT')){
            a.style.color = 'red';
        }

        tr.appendChild(td2);

        table.appendChild(tr);
    }
    return table;
}

const get_message_author = function(gr_message){
    var gr_account_label = gr_message.shadowRoot.querySelector('gr-account-label');
    var spans = gr_account_label.shadowRoot.querySelectorAll('span');
    for (var i=0; i < spans.length; i++){
        if (spans[i].className == 'name'){
            return spans[i].innerText;
        }
    }
    return null;
}

const get_message_text = function(gr_message){
    if (gr_message==null || gr_message.shadowRoot===undefined){
        return null;
    }
    var divs = gr_message.shadowRoot.querySelectorAll('div');
    for (var i=0; i<divs.length; i++){
        if (divs[i].className=='message hideOnOpen'){
            return divs[i].innerText;
        }
    }
    return null;
}

const get_last_zuul_message = function(){
    var gr_app = document.getElementsByTagName('gr-app')[0];
    var gr_app_element = gr_app.shadowRoot.querySelector('gr-app-element');
    var gr_change_view = gr_app_element.shadowRoot.querySelector('gr-change-view');
    var gr_messages_list = gr_change_view.shadowRoot.querySelector('gr-messages-list');
    var gr_messages = gr_messages_list.shadowRoot.querySelectorAll('gr-message');

    var last_zuul_message = null;

    for (var i=0, max=gr_messages.length; i < max; i++) {
        var author = get_message_author(gr_messages[i]);
        var message_text = get_message_text(gr_messages[i]);
        if (author == 'Zuul'){
            if (message_text!=null
                // ignore some zuul messages
                && message_text.startsWith('Build')
                && !message_text.includes('promote pipeline')){
                last_zuul_message = message_text;
            }
        }
    }

    return last_zuul_message;
};

var ci_table = null;

const inject_CI_table = function(){
    console.log('Injecting CI table...');
    var place_to_insert = get_place_to_insert_ci_table();
    var zuul_message = get_last_zuul_message();
    console.log('Last Zuul CI message: ' + zuul_message);
    if (zuul_message == null){
        console.log('No Zuul test result comment found.');
        refreshZuulStatus(place_to_insert);
        return;
    }
    if (ci_table != null){
        console.log('Remove stale CI table');
        ci_table.remove();
    }
    ci_table = get_ci_table(zuul_message);
    place_to_insert.appendChild(ci_table);
    console.log('CI table injected');

    refreshZuulStatus(place_to_insert);
};

const add_performance_observer = function() {
    // try to detect when all the data is loaded for the page
    const observer = new PerformanceObserver((list, obj) => {
        console.log('Zuul Status performance observer');
        for (let entry of list.getEntries()) {
            console.log('!!!! observed' + entry.initiatorType + '|' + entry.name);
            if(entry.initiatorType === "fetch"
               && entry.name.includes('submitted_together?')){
                console.log('Last REST fetch (submitted_together) ran, inject CI table in 1 second');

                // wait a second and then inject the CI table
                setTimeout(function(){inject_CI_table();}, 1000);
                observer.disconnect();
                return;
            }
        }
    });

    observer.observe({
        type: "resource",
        // without buffered: true, page on background tab does not trigger the fetch event.
        buffered: true,
    });
};

const subscribe_to_navigation_event = function(){
    const config = { childList: true, subtree: true };
    var href = document.location.href;
    const main_page_regexp = RegExp('review.opendev.org/c/.*/./[0-9]+(/[0-9]+/)?$');

    var c = function(mutationsList, observer) {
        console.log('Zuul Status mutation observer');
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList' && href != document.location.href) {
                href = document.location.href;
                if (main_page_regexp.test(href)){
                    add_performance_observer();
                }
            }
        }
    };
    const observer = new MutationObserver(c);
    observer.observe(document.querySelector('body'), config);
};


(function() {
    'use strict';
    console.log('User script triggered');
    add_performance_observer();
    subscribe_to_navigation_event();
})();
