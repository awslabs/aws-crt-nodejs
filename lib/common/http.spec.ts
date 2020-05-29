
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

test('HTTP Request', () => {
    let request = new HttpRequest("GET", "/index.html");

    expect(request.method).toBe("GET");
    expect(request.path).toBe('/index.html');
    expect(request.headers.length).toBe(0);

    request.method = "POST";
    request.path = "/test.html"

    expect(request.method).toBe("POST");
    expect(request.path).toBe('/test.html');

    request.headers.add("Host", "www.amazon.com");
    expect(request.headers.length).toBe(1);
});
