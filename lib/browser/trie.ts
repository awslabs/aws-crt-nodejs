/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/** @internal */
export class Node<T> {
    constructor(
        public key?: string,
        public value?: T,
        public children: Map<string, Node<T>> = new Map<string, Node<T>>()) {
    }
}

/** @internal */
export type KeySplitter = (key: string) => string[];
export type KeyCombiner = ( list: string[]) => string; 
/** @internal */
export enum TrieOp {
    Insert,
    Delete,
    Find,
};

/** @internal */
export class Trie<T> {
    protected root = new Node<T>();
    protected split_key: KeySplitter;
    protected combine_key : KeyCombiner;

    constructor(split: KeySplitter | string, combiner : KeyCombiner | string) {
        if (typeof (split) === 'string') {
            const delimeter = split;
            split = (key: string) => {
                return key.split(delimeter);
            }
        }
        if (typeof (combiner) === 'string') {
            const delimeter = combiner;
            combiner = (list: string[]) => {
                return list.join(delimeter);
            }
        }
        this.split_key = split;
        this.combine_key = combiner;
    }

    protected find_node(key: string, op: TrieOp) {
        const parts = this.split_key(key);
        let current = this.root;
        let parent = undefined;
        for (const part of parts) {
            let child = current.children.get(part);
            if (!child) {
                if (op == TrieOp.Insert) {
                    current.children.set(part, child = new Node(part));
                }
                else {
                    return undefined;
                }
            }
            parent = current;
            current = child;
        }
        if (parent && op == TrieOp.Delete) {
            parent.children.delete(current.key!);
        }
        return current;
    }

    protected combineKey(list: string[]) : string
    {
        return this.combine_key(list);
    }

    protected traverseTree(node: Node<T>, fun: Function, parent_key?: string)
    {
        var key = node.key == undefined? node.key: "";
        if(parent_key != undefined) {
            key = this.combineKey([parent_key, node.key!]);
        }
        if(node.value != undefined)
        {
            fun(key, node.value);
        }
        for (const child of node.children) {
            this.traverseTree(child[1], fun, key);
        }
    }

    insert(key: string, value: T) {
        let node = this.find_node(key, TrieOp.Insert);
        node!.value = value;
    }

    remove(key: string) {
        this.find_node(key, TrieOp.Delete);
    }

    find(key: string) {
        const node = this.find_node(key, TrieOp.Find);
        return node ? node.value : undefined;
    }

    traverseAll(fun: Function){
        this.traverseTree(this.root, fun);
    }
}
