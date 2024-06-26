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
import { Add, AggregateExpr, And, BinaryExpr, BoolModifier, Div, Duration, Eql, EqlRegex, EqlSingle, FunctionCallBody, GroupingLabels, Gte, Gtr, LabelMatchers, LabelName, Lss, Lte, MatchOp, MatrixSelector, Identifier, Mod, Mul, Neq, NeqRegex, NumberLiteral, OffsetExpr, Or, Pow, PromQL, StepInvariantExpr, StringLiteral, Sub, SubqueryExpr, Unless, VectorSelector, UnquotedLabelMatcher, QuotedLabelMatcher, QuotedLabelName, } from '@prometheus-io/lezer-promql';
import { buildLabelMatchers, containsAtLeastOneChild, containsChild, walkBackward } from '../parser';
import { aggregateOpModifierTerms, aggregateOpTerms, atModifierTerms, binOpModifierTerms, binOpTerms, durationTerms, functionIdentifierTerms, matchOpTerms, numberTerms, snippets, } from './promql.terms';
import { syntaxTree } from '@codemirror/language';
const autocompleteNodes = {
    matchOp: matchOpTerms,
    binOp: binOpTerms,
    duration: durationTerms,
    binOpModifier: binOpModifierTerms,
    atModifier: atModifierTerms,
    functionIdentifier: functionIdentifierTerms,
    aggregateOp: aggregateOpTerms,
    aggregateOpModifier: aggregateOpModifierTerms,
    number: numberTerms,
};
// ContextKind is the different possible value determinate by the autocompletion
export var ContextKind;
(function (ContextKind) {
    // dynamic autocompletion (required a distant server)
    ContextKind[ContextKind["MetricName"] = 0] = "MetricName";
    ContextKind[ContextKind["LabelName"] = 1] = "LabelName";
    ContextKind[ContextKind["LabelValue"] = 2] = "LabelValue";
    // static autocompletion
    ContextKind[ContextKind["Function"] = 3] = "Function";
    ContextKind[ContextKind["Aggregation"] = 4] = "Aggregation";
    ContextKind[ContextKind["BinOpModifier"] = 5] = "BinOpModifier";
    ContextKind[ContextKind["BinOp"] = 6] = "BinOp";
    ContextKind[ContextKind["MatchOp"] = 7] = "MatchOp";
    ContextKind[ContextKind["AggregateOpModifier"] = 8] = "AggregateOpModifier";
    ContextKind[ContextKind["Duration"] = 9] = "Duration";
    ContextKind[ContextKind["Offset"] = 10] = "Offset";
    ContextKind[ContextKind["Bool"] = 11] = "Bool";
    ContextKind[ContextKind["AtModifiers"] = 12] = "AtModifiers";
    ContextKind[ContextKind["Number"] = 13] = "Number";
})(ContextKind || (ContextKind = {}));
function getMetricNameInGroupBy(tree, state) {
    // There should be an AggregateExpr as parent of the GroupingLabels.
    // Then we should find the VectorSelector child to be able to find the metric name.
    const currentNode = walkBackward(tree, AggregateExpr);
    if (!currentNode) {
        return '';
    }
    let metricName = '';
    currentNode.cursor().iterate((node) => {
        // Continue until we find the VectorSelector, then look up the metric name.
        if (node.type.id === VectorSelector) {
            metricName = getMetricNameInVectorSelector(node.node, state);
            if (metricName) {
                return false;
            }
        }
    });
    return metricName;
}
function getMetricNameInVectorSelector(tree, state) {
    // Find if there is a defined metric name. Should be used to autocomplete a labelValue or a labelName
    // First find the parent "VectorSelector" to be able to find then the subChild "Identifier" if it exists.
    let currentNode = walkBackward(tree, VectorSelector);
    if (!currentNode) {
        // Weird case that shouldn't happen, because "VectorSelector" is by definition the parent of the LabelMatchers.
        return '';
    }
    currentNode = currentNode.getChild(Identifier);
    if (!currentNode) {
        return '';
    }
    return state.sliceDoc(currentNode.from, currentNode.to);
}
function arrayToCompletionResult(data, from, to, includeSnippet = false, span = true) {
    const options = data;
    if (includeSnippet) {
        options.push(...snippets);
    }
    return {
        from: from,
        to: to,
        options: options,
        validFor: span ? /^[a-zA-Z0-9_:]+$/ : undefined,
    };
}
// computeStartCompleteLabelPositionInLabelMatcherOrInGroupingLabel calculates the start position only when the node is a LabelMatchers or a GroupingLabels
function computeStartCompleteLabelPositionInLabelMatcherOrInGroupingLabel(node, pos) {
    // Here we can have two different situations:
    // 1. `metric{}` or `sum by()` with the cursor between the bracket
    // and so we have increment the starting position to avoid to consider the open bracket when filtering the autocompletion list.
    // 2. `metric{foo="bar",} or `sum by(foo,)  with the cursor after the comma.
    // Then the start number should be the current position to avoid to consider the previous labelMatcher/groupingLabel when filtering the autocompletion list.
    let start = node.from + 1;
    if (node.firstChild !== null) {
        // here that means the LabelMatchers / GroupingLabels has a child, which is not possible if we have the expression `metric{}`. So we are likely trying to autocomplete the label list after a comma
        start = pos;
    }
    return start;
}
// computeStartCompletePosition calculates the start position of the autocompletion.
// It is an important step because the start position will be used by CMN to find the string and then to use it to filter the CompletionResult.
// A wrong `start` position will lead to have the completion not working.
// Note: this method is exported only for testing purpose.
export function computeStartCompletePosition(node, pos) {
    var _a, _b, _c, _d, _e, _f, _g;
    let start = node.from;
    if (node.type.id === LabelMatchers || node.type.id === GroupingLabels) {
        start = computeStartCompleteLabelPositionInLabelMatcherOrInGroupingLabel(node, pos);
    }
    else if (node.type.id === FunctionCallBody ||
        (node.type.id === StringLiteral && (((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type.id) === UnquotedLabelMatcher || ((_b = node.parent) === null || _b === void 0 ? void 0 : _b.type.id) === QuotedLabelMatcher))) {
        // When the cursor is between bracket, quote, we need to increment the starting position to avoid to consider the open bracket/ first string.
        start++;
    }
    else if (node.type.id === OffsetExpr ||
        (node.type.id === NumberLiteral && ((_c = node.parent) === null || _c === void 0 ? void 0 : _c.type.id) === 0 && ((_d = node.parent.parent) === null || _d === void 0 ? void 0 : _d.type.id) === SubqueryExpr) ||
        (node.type.id === 0 &&
            (((_e = node.parent) === null || _e === void 0 ? void 0 : _e.type.id) === OffsetExpr ||
                ((_f = node.parent) === null || _f === void 0 ? void 0 : _f.type.id) === MatrixSelector ||
                (((_g = node.parent) === null || _g === void 0 ? void 0 : _g.type.id) === SubqueryExpr && containsAtLeastOneChild(node.parent, Duration))))) {
        start = pos;
    }
    return start;
}
// analyzeCompletion is going to determinate what should be autocompleted.
// The value of the autocompletion is then calculate by the function buildCompletion.
// Note: this method is exported for testing purpose only. Do not use it directly.
export function analyzeCompletion(state, node) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    const result = [];
    switch (node.type.id) {
        case 0: // 0 is the id of the error node
            if (((_a = node.parent) === null || _a === void 0 ? void 0 : _a.type.id) === OffsetExpr) {
                // we are likely in the given situation:
                // `metric_name offset 5` that leads to this tree:
                // `OffsetExpr(VectorSelector(Identifier),Offset,⚠)`
                // Here we can just autocomplete a duration.
                result.push({ kind: ContextKind.Duration });
                break;
            }
            if (((_b = node.parent) === null || _b === void 0 ? void 0 : _b.type.id) === UnquotedLabelMatcher || ((_c = node.parent) === null || _c === void 0 ? void 0 : _c.type.id) === QuotedLabelMatcher) {
                // In this case the current token is not itself a valid match op yet:
                //      metric_name{labelName!}
                result.push({ kind: ContextKind.MatchOp });
                break;
            }
            if (((_d = node.parent) === null || _d === void 0 ? void 0 : _d.type.id) === MatrixSelector) {
                // we are likely in the given situation:
                // `metric_name{}[5]`
                // We can also just autocomplete a duration
                result.push({ kind: ContextKind.Duration });
                break;
            }
            if (((_e = node.parent) === null || _e === void 0 ? void 0 : _e.type.id) === SubqueryExpr && containsAtLeastOneChild(node.parent, Duration)) {
                // we are likely in the given situation:
                //    `rate(foo[5d:5])`
                // so we should autocomplete a duration
                result.push({ kind: ContextKind.Duration });
                break;
            }
            // when we are in the situation 'metric_name !', we have the following tree
            // VectorSelector(Identifier,⚠)
            // We should try to know if the char '!' is part of a binOp.
            // Note: as it is quite experimental, maybe it requires more condition and to check the current tree (parent, other child at the same level ..etc.).
            const operator = state.sliceDoc(node.from, node.to);
            if (binOpTerms.filter((term) => term.label.includes(operator)).length > 0) {
                result.push({ kind: ContextKind.BinOp });
            }
            break;
        case Identifier:
            // sometimes an Identifier has an error has parent. This should be treated in priority
            if (((_f = node.parent) === null || _f === void 0 ? void 0 : _f.type.id) === 0) {
                const errorNodeParent = node.parent.parent;
                if ((errorNodeParent === null || errorNodeParent === void 0 ? void 0 : errorNodeParent.type.id) === StepInvariantExpr) {
                    // we are likely in the given situation:
                    //   `expr @ s`
                    // we can autocomplete start / end
                    result.push({ kind: ContextKind.AtModifiers });
                    break;
                }
                if ((errorNodeParent === null || errorNodeParent === void 0 ? void 0 : errorNodeParent.type.id) === AggregateExpr) {
                    // it matches 'sum() b'. So here we can autocomplete:
                    // - the aggregate operation modifier
                    // - the binary operation (since it's not mandatory to have an aggregate operation modifier)
                    result.push({ kind: ContextKind.AggregateOpModifier }, { kind: ContextKind.BinOp });
                    break;
                }
                if ((errorNodeParent === null || errorNodeParent === void 0 ? void 0 : errorNodeParent.type.id) === VectorSelector) {
                    // it matches 'sum b'. So here we also have to autocomplete the aggregate operation modifier only
                    // if the associated identifier is matching an aggregation operation.
                    // Note: here is the corresponding tree in order to understand the situation:
                    // VectorSelector(
                    //   Identifier,
                    //   ⚠(Identifier)
                    // )
                    const operator = getMetricNameInVectorSelector(node, state);
                    if (aggregateOpTerms.filter((term) => term.label === operator).length > 0) {
                        result.push({ kind: ContextKind.AggregateOpModifier });
                    }
                    // It's possible it also match the expr 'metric_name unle'.
                    // It's also possible that the operator is also a metric even if it matches the list of aggregation function.
                    // So we also have to autocomplete the binary operator.
                    //
                    // The expr `metric_name off` leads to the same tree. So we have to provide the offset keyword too here.
                    result.push({ kind: ContextKind.BinOp }, { kind: ContextKind.Offset });
                    break;
                }
                if (errorNodeParent && containsChild(errorNodeParent, 'Expr')) {
                    // this last case can appear with the following expression:
                    // 1. http_requests_total{method="GET"} off
                    // 2. rate(foo[5m]) un
                    // 3. sum(http_requests_total{method="GET"} off)
                    // For these different cases we have this kind of tree:
                    // Parent (
                    //    ⚠(Identifier)
                    // )
                    // We don't really care about the parent, here we are more interested if in the siblings of the error node, there is the node 'Expr'
                    // If it is the case, then likely we should autocomplete the BinOp or the offset.
                    result.push({ kind: ContextKind.BinOp }, { kind: ContextKind.Offset });
                    break;
                }
            }
            // As the leaf Identifier is coming for different cases, we have to take a bit time to analyze the tree
            // in order to know what we have to autocomplete exactly.
            // Here is some cases:
            // 1. metric_name / ignor --> we should autocomplete the BinOpModifier + metric/function/aggregation
            // 2. sum(http_requests_total{method="GET"} / o) --> BinOpModifier + metric/function/aggregation
            // Examples above give a different tree each time and ends up to be treated in this case.
            // But they all have the following common tree pattern:
            // Parent( ...,
            //         ... ,
            //         VectorSelector(Identifier)
            //       )
            //
            // So the first things to do is to get the `Parent` and to determinate if we are in this configuration.
            // Otherwise we would just have to autocomplete the metric / function / aggregation.
            const parent = (_g = node.parent) === null || _g === void 0 ? void 0 : _g.parent;
            if (!parent) {
                // this case can be possible if the topNode is not anymore PromQL but MetricName.
                // In this particular case, then we just want to autocomplete the metric
                result.push({ kind: ContextKind.MetricName, metricName: state.sliceDoc(node.from, node.to) });
                break;
            }
            // now we have to know if we have two Expr in the direct children of the `parent`
            const containExprTwice = containsChild(parent, 'Expr', 'Expr');
            if (containExprTwice) {
                if (parent.type.id === BinaryExpr && !containsAtLeastOneChild(parent, 0)) {
                    // We are likely in the case 1 or 5
                    result.push({ kind: ContextKind.MetricName, metricName: state.sliceDoc(node.from, node.to) }, { kind: ContextKind.Function }, { kind: ContextKind.Aggregation }, { kind: ContextKind.BinOpModifier }, { kind: ContextKind.Number });
                    // in  case the BinaryExpr is a comparison, we should autocomplete the `bool` keyword. But only if it is not present.
                    // When the `bool` keyword is NOT present, then the expression looks like this:
                    // 			BinaryExpr( ..., Gtr , ... )
                    // When the `bool` keyword is present, then the expression looks like this:
                    //      BinaryExpr( ..., Gtr , BoolModifier(...), ... )
                    if (containsAtLeastOneChild(parent, Eql, Gte, Gtr, Lte, Lss, Neq) && !containsAtLeastOneChild(parent, BoolModifier)) {
                        result.push({ kind: ContextKind.Bool });
                    }
                }
            }
            else {
                result.push({ kind: ContextKind.MetricName, metricName: state.sliceDoc(node.from, node.to) }, { kind: ContextKind.Function }, { kind: ContextKind.Aggregation });
                if (parent.type.id !== FunctionCallBody && parent.type.id !== MatrixSelector) {
                    // it's too avoid to autocomplete a number in situation where it shouldn't.
                    // Like with `sum by(rat)`
                    result.push({ kind: ContextKind.Number });
                }
            }
            break;
        case PromQL:
            if (node.firstChild !== null && node.firstChild.type.id === 0) {
                // this situation can happen when there is nothing in the text area and the user is explicitly triggering the autocompletion (with ctrl + space)
                result.push({ kind: ContextKind.MetricName, metricName: '' }, { kind: ContextKind.Function }, { kind: ContextKind.Aggregation }, { kind: ContextKind.Number });
            }
            break;
        case GroupingLabels:
            // In this case we are in the given situation:
            //      sum by () or sum (metric_name) by ()
            // so we have or to autocomplete any kind of labelName or to autocomplete only the labelName associated to the metric
            result.push({ kind: ContextKind.LabelName, metricName: getMetricNameInGroupBy(node, state) });
            break;
        case LabelMatchers:
            // In that case we are in the given situation:
            //       metric_name{} or {}
            // so we have or to autocomplete any kind of labelName or to autocomplete only the labelName associated to the metric
            result.push({ kind: ContextKind.LabelName, metricName: getMetricNameInVectorSelector(node, state) });
            break;
        case LabelName:
            if (((_h = node.parent) === null || _h === void 0 ? void 0 : _h.type.id) === GroupingLabels) {
                // In this case we are in the given situation:
                //      sum by (myL)
                // So we have to continue to autocomplete any kind of labelName
                result.push({ kind: ContextKind.LabelName });
            }
            else if (((_j = node.parent) === null || _j === void 0 ? void 0 : _j.type.id) === UnquotedLabelMatcher) {
                // In that case we are in the given situation:
                //       metric_name{myL} or {myL}
                // so we have or to continue to autocomplete any kind of labelName or
                // to continue to autocomplete only the labelName associated to the metric
                result.push({ kind: ContextKind.LabelName, metricName: getMetricNameInVectorSelector(node, state) });
            }
            break;
        case StringLiteral:
            if (((_k = node.parent) === null || _k === void 0 ? void 0 : _k.type.id) === UnquotedLabelMatcher || ((_l = node.parent) === null || _l === void 0 ? void 0 : _l.type.id) === QuotedLabelMatcher) {
                // In this case we are in the given situation:
                //      metric_name{labelName=""} or metric_name{"labelName"=""}
                // So we can autocomplete the labelValue
                // Get the labelName.
                // By definition it's the firstChild: https://github.com/promlabs/lezer-promql/blob/0ef65e196a8db6a989ff3877d57fd0447d70e971/src/promql.grammar#L250
                let labelName = '';
                if (((_m = node.parent.firstChild) === null || _m === void 0 ? void 0 : _m.type.id) === LabelName) {
                    labelName = state.sliceDoc(node.parent.firstChild.from, node.parent.firstChild.to);
                }
                else if (((_o = node.parent.firstChild) === null || _o === void 0 ? void 0 : _o.type.id) === QuotedLabelName) {
                    labelName = state.sliceDoc(node.parent.firstChild.from, node.parent.firstChild.to).slice(1, -1);
                }
                // then find the metricName if it exists
                const metricName = getMetricNameInVectorSelector(node, state);
                // finally get the full matcher available
                const matcherNode = walkBackward(node, LabelMatchers);
                const labelMatcherOpts = [QuotedLabelName, QuotedLabelMatcher, UnquotedLabelMatcher];
                let labelMatchers = [];
                for (const labelMatcherOpt of labelMatcherOpts) {
                    labelMatchers = labelMatchers.concat(buildLabelMatchers(matcherNode ? matcherNode.getChildren(labelMatcherOpt) : [], state));
                }
                result.push({
                    kind: ContextKind.LabelValue,
                    metricName: metricName,
                    labelName: labelName,
                    matchers: labelMatchers,
                });
            }
            else if (((_q = (_p = node.parent) === null || _p === void 0 ? void 0 : _p.parent) === null || _q === void 0 ? void 0 : _q.type.id) === GroupingLabels) {
                // In this case we are in the given situation:
                //      sum by ("myL")
                // So we have to continue to autocomplete any kind of labelName
                result.push({ kind: ContextKind.LabelName });
            }
            else if (((_s = (_r = node.parent) === null || _r === void 0 ? void 0 : _r.parent) === null || _s === void 0 ? void 0 : _s.type.id) === LabelMatchers) {
                // In that case we are in the given situation:
                //       {""} or {"metric_"}
                // since this is for the QuotedMetricName we need to continue to autocomplete for the metric names
                result.push({ kind: ContextKind.MetricName, metricName: state.sliceDoc(node.from, node.to).slice(1, -1) });
            }
            break;
        case NumberLiteral:
            if (((_t = node.parent) === null || _t === void 0 ? void 0 : _t.type.id) === 0 && ((_u = node.parent.parent) === null || _u === void 0 ? void 0 : _u.type.id) === SubqueryExpr) {
                // Here we are likely in this situation:
                //     `go[5d:4]`
                // and we have the given tree:
                // SubqueryExpr(
                //   VectorSelector(Identifier),
                //   Duration, Duration, ⚠(NumberLiteral)
                // )
                // So we should continue to autocomplete a duration
                result.push({ kind: ContextKind.Duration });
            }
            else {
                result.push({ kind: ContextKind.Number });
            }
            break;
        case Duration:
        case OffsetExpr:
            result.push({ kind: ContextKind.Duration });
            break;
        case FunctionCallBody:
            // In this case we are in the given situation:
            //       sum() or in rate()
            // with the cursor between the bracket. So we can autocomplete the metric, the function and the aggregation.
            result.push({ kind: ContextKind.MetricName, metricName: '' }, { kind: ContextKind.Function }, { kind: ContextKind.Aggregation });
            break;
        case Neq:
            if (((_v = node.parent) === null || _v === void 0 ? void 0 : _v.type.id) === MatchOp) {
                result.push({ kind: ContextKind.MatchOp });
            }
            else if (((_w = node.parent) === null || _w === void 0 ? void 0 : _w.type.id) === BinaryExpr) {
                result.push({ kind: ContextKind.BinOp });
            }
            break;
        case EqlSingle:
        case EqlRegex:
        case NeqRegex:
        case MatchOp:
            result.push({ kind: ContextKind.MatchOp });
            break;
        case Pow:
        case Mul:
        case Div:
        case Mod:
        case Add:
        case Sub:
        case Eql:
        case Gte:
        case Gtr:
        case Lte:
        case Lss:
        case And:
        case Unless:
        case Or:
        case BinaryExpr:
            result.push({ kind: ContextKind.BinOp });
            break;
    }
    return result;
}
// HybridComplete provides a full completion result with or without a remote prometheus.
export class HybridComplete {
    constructor(prometheusClient, maxMetricsMetadata = 10000) {
        this.prometheusClient = prometheusClient;
        this.maxMetricsMetadata = maxMetricsMetadata;
    }
    getPrometheusClient() {
        return this.prometheusClient;
    }
    promQL(context) {
        const { state, pos } = context;
        const tree = syntaxTree(state).resolve(pos, -1);
        const contexts = analyzeCompletion(state, tree);
        let asyncResult = Promise.resolve([]);
        let completeSnippet = false;
        let span = true;
        for (const context of contexts) {
            switch (context.kind) {
                case ContextKind.Aggregation:
                    completeSnippet = true;
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.aggregateOp);
                    });
                    break;
                case ContextKind.Function:
                    completeSnippet = true;
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.functionIdentifier);
                    });
                    break;
                case ContextKind.BinOpModifier:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.binOpModifier);
                    });
                    break;
                case ContextKind.BinOp:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.binOp);
                    });
                    break;
                case ContextKind.MatchOp:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.matchOp);
                    });
                    break;
                case ContextKind.AggregateOpModifier:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.aggregateOpModifier);
                    });
                    break;
                case ContextKind.Duration:
                    span = false;
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.duration);
                    });
                    break;
                case ContextKind.Offset:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat([{ label: 'offset' }]);
                    });
                    break;
                case ContextKind.Bool:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat([{ label: 'bool' }]);
                    });
                    break;
                case ContextKind.AtModifiers:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.atModifier);
                    });
                    break;
                case ContextKind.Number:
                    asyncResult = asyncResult.then((result) => {
                        return result.concat(autocompleteNodes.number);
                    });
                    break;
                case ContextKind.MetricName:
                    asyncResult = asyncResult.then((result) => {
                        return this.autocompleteMetricName(result, context);
                    });
                    break;
                case ContextKind.LabelName:
                    asyncResult = asyncResult.then((result) => {
                        return this.autocompleteLabelName(result, context);
                    });
                    break;
                case ContextKind.LabelValue:
                    asyncResult = asyncResult.then((result) => {
                        return this.autocompleteLabelValue(result, context);
                    });
            }
        }
        return asyncResult.then((result) => {
            return arrayToCompletionResult(result, computeStartCompletePosition(tree, pos), pos, completeSnippet, span);
        });
    }
    autocompleteMetricName(result, context) {
        if (!this.prometheusClient) {
            return result;
        }
        const metricCompletion = new Map();
        return this.prometheusClient
            .metricNames(context.metricName)
            .then((metricNames) => {
            var _a;
            for (const metricName of metricNames) {
                metricCompletion.set(metricName, { label: metricName, type: 'constant' });
            }
            // avoid to get all metric metadata if the prometheus server is too big
            if (metricNames.length <= this.maxMetricsMetadata) {
                // in order to enrich the completion list of the metric,
                // we are trying to find the associated metadata
                return (_a = this.prometheusClient) === null || _a === void 0 ? void 0 : _a.metricMetadata();
            }
        })
            .then((metricMetadata) => {
            if (metricMetadata) {
                for (const [metricName, node] of metricCompletion) {
                    // For histograms and summaries, the metadata is only exposed for the base metric name,
                    // not separately for the _count, _sum, and _bucket time series.
                    const metadata = metricMetadata[metricName.replace(/(_count|_sum|_bucket)$/, '')];
                    if (metadata) {
                        if (metadata.length > 1) {
                            // it means the metricName has different possible helper and type
                            for (const m of metadata) {
                                if (node.detail === '') {
                                    node.detail = m.type;
                                }
                                else if (node.detail !== m.type) {
                                    node.detail = 'unknown';
                                    node.info = 'multiple different definitions for this metric';
                                }
                                if (node.info === '') {
                                    node.info = m.help;
                                }
                                else if (node.info !== m.help) {
                                    node.info = 'multiple different definitions for this metric';
                                }
                            }
                        }
                        else if (metadata.length === 1) {
                            let { type, help } = metadata[0];
                            if (type === 'histogram' || type === 'summary') {
                                if (metricName.endsWith('_count')) {
                                    type = 'counter';
                                    help = `The total number of observations for: ${help}`;
                                }
                                if (metricName.endsWith('_sum')) {
                                    type = 'counter';
                                    help = `The total sum of observations for: ${help}`;
                                }
                                if (metricName.endsWith('_bucket')) {
                                    type = 'counter';
                                    help = `The total count of observations for a bucket in the histogram: ${help}`;
                                }
                            }
                            node.detail = type;
                            node.info = help;
                        }
                    }
                }
            }
            return result.concat(Array.from(metricCompletion.values()));
        });
    }
    autocompleteLabelName(result, context) {
        if (!this.prometheusClient) {
            return result;
        }
        return this.prometheusClient.labelNames(context.metricName).then((labelNames) => {
            return result.concat(labelNames.map((value) => ({ label: value, type: 'constant' })));
        });
    }
    autocompleteLabelValue(result, context) {
        if (!this.prometheusClient || !context.labelName) {
            return result;
        }
        return this.prometheusClient.labelValues(context.labelName, context.metricName, context.matchers).then((labelValues) => {
            return result.concat(labelValues.map((value) => ({ label: value, type: 'text' })));
        });
    }
}
//# sourceMappingURL=hybrid.js.map