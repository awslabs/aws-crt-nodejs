/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/*
 * Minimal local TypeDoc plugin.
 *
 * typedoc-plugin-merge-modules consumes the `@mergeTarget` block tag (used with
 * `mergeModulesMergeMode: "module"`) but does not register it with TypeDoc's
 * comment parser. Under TypeDoc >= 0.28, an unregistered block tag is reported
 * as an "unknown block tag" warning, and because our docs config sets
 * `treatWarningsAsErrors: true`, that fails the docs build.
 *
 * This plugin appends `@mergeTarget` to whatever the current `blockTags`
 * default is (rather than hard-coding TypeDoc's full default list), so it stays
 * correct across TypeDoc upgrades. We set it at BOOTSTRAP_END: options have
 * been read (so this isn't overwritten by TypeDoc's post-plugin option read)
 * but are not yet frozen, and the comment parser config is built later during
 * conversion. This mirrors how typedoc-plugin-merge-modules itself hooks in.
 */
exports.load = function load(app) {
    const { Application } = require("typedoc");
    app.on(Application.EVENT_BOOTSTRAP_END, () => {
        const blockTags = app.options.getValue("blockTags");
        if (!blockTags.includes("@mergeTarget")) {
            app.options.setValue("blockTags", [...blockTags, "@mergeTarget"]);
        }
    });
};
