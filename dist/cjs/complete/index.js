"use strict";
// Copyright 2021 The Prometheus Authors
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.newCompleteStrategy = exports.isPrometheusClient = void 0;
var hybrid_1 = require("./hybrid");
var prometheus_1 = require("../client/prometheus");
function isPrometheusClient(remoteConfig) {
    var client = remoteConfig;
    return (typeof client.labelNames === 'function' &&
        typeof client.labelValues === 'function' &&
        typeof client.metricMetadata === 'function' &&
        typeof client.series === 'function' &&
        typeof client.metricNames === 'function');
}
exports.isPrometheusClient = isPrometheusClient;
function newCompleteStrategy(conf) {
    if (conf === null || conf === void 0 ? void 0 : conf.completeStrategy) {
        return conf.completeStrategy;
    }
    if (conf === null || conf === void 0 ? void 0 : conf.remote) {
        if (isPrometheusClient(conf.remote)) {
            return new hybrid_1.HybridComplete(conf.remote, conf.maxMetricsMetadata);
        }
        return new hybrid_1.HybridComplete(new prometheus_1.CachedPrometheusClient(new prometheus_1.HTTPPrometheusClient(conf.remote), conf.remote.cache), conf.maxMetricsMetadata);
    }
    return new hybrid_1.HybridComplete();
}
exports.newCompleteStrategy = newCompleteStrategy;
//# sourceMappingURL=index.js.map