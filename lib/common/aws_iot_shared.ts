/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/**
 *
 * A module containing miscellaneous functionality that is shared across both native and browser for aws_iot
 *
 * @packageDocumentation
 * @module aws_iot
 */


/**
 * A helper function to add parameters to the username in with_custom_authorizer function
 *
 * @internal
 */
 export function add_to_username_parameter(current_username : string, parameter_value : string, parameter_pre_text : string) {
    let return_string = current_username;

    if (return_string.indexOf("?") != -1) {
        return_string += "&"
    } else {
        return_string += "?"
    }

    if (parameter_value.indexOf(parameter_pre_text) != -1) {
        return return_string + parameter_value;
    } else {
        return return_string + parameter_pre_text + parameter_value;
    }
}

/**
 * A helper function to see if a string is not null, is defined, and is not an empty string
 *
 * @internal
 */
 export function is_string_and_not_empty(item : any) {
    return item != undefined && typeof(item) == 'string' && item != "";
}

/**
 * A helper function to populate the username with the Custom Authorizer fields
 * @param current_username the current username
 * @param input_username the username to add - can be an empty string to skip
 * @param input_authorizer the name of the authorizer to add - can be an empty string to skip
 * @param input_signature the name of the signature to add - can be an empty string to skip
 * @param input_builder_username the username from the MQTT builder
 * @returns The finished username with the additions added to it
 *
 * @internal
 */
export function populate_username_string_with_custom_authorizer(
    current_username? : string, input_username? : string, input_authorizer? : string,
    input_signature? : string, input_builder_username? : string) {

    let username_string = "";

    if (current_username) {
        username_string += current_username;
    }
    if (is_string_and_not_empty(input_username) == false) {
        if (is_string_and_not_empty(input_builder_username) && input_builder_username) {
            username_string += input_builder_username;
        }
    }
    else {
        username_string += input_username;
    }

    if (is_string_and_not_empty(input_authorizer) && input_authorizer) {
        username_string = add_to_username_parameter(username_string, input_authorizer, "x-amz-customauthorizer-name=");
    }
    if (is_string_and_not_empty(input_signature) && input_signature) {
        username_string = add_to_username_parameter(username_string, input_signature, "x-amz-customauthorizer-signature=");
    }

    return username_string;
}

