
import { HttpHeader, HttpHeaders, HttpRequest } from '@awscrt/http';

test('HTTP Headers', () => {

    const header_array: HttpHeader[] = [
        ['Host', 'www.amazon.com'],
        ['Content-Length', '42'],
    ];
    let headers = new HttpHeaders(header_array);
    let request = new HttpRequest("", "", new HttpHeaders(header_array));
    <unknown>request;

    const iterator = headers[Symbol.iterator].call(headers);
    <unknown>iterator;
    const next = iterator.next.call(iterator);
    <unknown>next;

    let found_headers = 0;
    for (const header of headers) {
        expect(['Host', 'Content-Length']).toContain(header[0]);
        expect(['www.amazon.com', '42']).toContain(header[1]);
        found_headers++;
    }
    expect(found_headers).toBe(2);
    // Upgrade header does not exist
    expect(headers.get('Upgrade')).toBeFalsy();

    // Make sure case doesn't matter
    expect(headers.get('HOST')).toBe('www.amazon.com');

    // Remove Content-Length, and make sure host is all that's left
    headers.remove('content-length');
    found_headers = 0;
    for (const header of headers) {
        expect(header[0]).toBe('Host');
        expect(header[1]).toBe('www.amazon.com');
        found_headers++;
    }
    expect(found_headers).toBe(1);

    headers.clear();
    for (const header of headers) {
        // this should never be called
        expect(header).toBeNull();
    }
});
