import Foundation
import Testing
@testable import SkinnyLegend

@Suite("DeviceLocale")
struct DeviceLocaleTests {
    @Test("Vietnamese devices report vi")
    func vietnamese() {
        #expect(DeviceLocale.from(Locale(identifier: "vi_VN")) == .vi)
    }

    @Test("Everything else reports en")
    func other() {
        #expect(DeviceLocale.from(Locale(identifier: "en_US")) == .en)
        #expect(DeviceLocale.from(Locale(identifier: "ja_JP")) == .en)
    }

    @Test("A resolved app language maps onto the wire value")
    func fromResolved() {
        #expect(DeviceLocale(.vi) == .vi)
        #expect(DeviceLocale(.en) == .en)
    }
}
