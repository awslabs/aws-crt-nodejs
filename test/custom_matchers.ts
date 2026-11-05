import { expect } from "@jest/globals";

/*
 * Note: jest by default does not compare contents of complex classes like DataView.
 * So when comparing two data views for equality we equality we always end up with true result because
 * the only thing compared is the type of the instance.
 * So add a custom comparison operation for it.
 * Its possible to make it global for all tests with some additional work. 
 * Jest 30 is adding DataView equivalence checks out of the box.
*/

declare global {
    namespace jest {
        interface Matchers<R> {
            toEqualDataView(expected: DataView): R;
        }
    }
}
  
expect.extend({
    toEqualDataView(actual: DataView, expected: DataView) {
        let dv_actual = actual as DataView;
        let dv_expected = expected as DataView;
    
        if (dv_actual.buffer.byteLength !== dv_expected.buffer.byteLength) {
            return {
                message: () => 'DataViews of different length; actual: ${dv1.buffer.byteLength}, expected: ${dv2.buffer.byteLength}',
                pass: false
            };
        }
    
        for (let i = 0; i < dv_actual.buffer.byteLength; i++) {
            if (dv_actual.getUint8(i) !== dv_expected.getUint8(i)) {
                return {
                    message: () => 'DataViews byte mismatch at index ${i}; actual: ${dv_actual.getUint8(i)}, expected: ${dv_expected.getUint8(i)}',
                    pass: false
                };
            }
        }
    
        return {
            message: () => 'DataViews are equal',
            pass: true
        };
    },
});
