import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import {
  computeLoyaltyPoints,
  computeMultiCategoryPricing,
  computeServicePricing,
  escapeRegex,
  extractRefId,
} from "@/lib/utils";

describe("Utils", () => {
  describe("escapeRegex", () => {
    it("should escape special regex characters", () => {
      expect(escapeRegex("hello.world")).toBe("hello\\.world");
      expect(escapeRegex("test*value")).toBe("test\\*value");
      expect(escapeRegex("data(test)")).toBe("data\\(test\\)");
      expect(escapeRegex("price$100")).toBe("price\\$100");
    });

    it("should escape brackets", () => {
      expect(escapeRegex("[test]")).toBe("\\[test\\]");
      expect(escapeRegex("{test}")).toBe("\\{test\\}");
    });

    it("should escape plus and question mark", () => {
      expect(escapeRegex("test+value")).toBe("test\\+value");
      expect(escapeRegex("what?")).toBe("what\\?");
    });

    it("should handle empty string", () => {
      expect(escapeRegex("")).toBe("");
    });

    it("should preserve normal characters", () => {
      expect(escapeRegex("hello123")).toBe("hello123");
      expect(escapeRegex("user_name")).toBe("user_name");
    });
  });

  describe("computeServicePricing", () => {
    const mockService = {
      name: "Haircut",
      revenueSharing: {
        ownerPercentage: 60,
        employeePercentage: 40,
      },
      price: 100000, // 100k IDR
    };

    it("should compute pricing with no discount", () => {
      const result = computeServicePricing(mockService, 0);

      expect(result.subtotal).toBe(100000);
      expect(result.discountAmount).toBe(0);
      expect(result.total).toBe(100000);
      expect(result.ownerRevenue).toBe(60000); // 60%
      expect(result.employeeRevenue).toBe(40000); // 40%
    });

    it("should compute pricing with discount", () => {
      const result = computeServicePricing(mockService, 20000); // 20k discount

      expect(result.subtotal).toBe(100000);
      expect(result.discountAmount).toBe(20000);
      expect(result.total).toBe(80000);
      expect(result.ownerRevenue).toBe(48000); // 60% of 80k
      expect(result.employeeRevenue).toBe(32000); // 40% of 80k
    });

    it("should handle 100% discount", () => {
      const result = computeServicePricing(mockService, 100000);

      expect(result.subtotal).toBe(100000);
      expect(result.discountAmount).toBe(100000);
      expect(result.total).toBe(0);
      expect(result.ownerRevenue).toBe(0);
      expect(result.employeeRevenue).toBe(0);
    });

    it("should handle zero discount", () => {
      const result = computeServicePricing(mockService, 0);
      expect(result.total).toBe(result.subtotal);
      expect(result.ownerRevenue + result.employeeRevenue).toBe(result.total);
    });

    it("should ensure owner + employee revenue equals total", () => {
      const result = computeServicePricing(mockService, 25000);
      expect(result.ownerRevenue + result.employeeRevenue).toBe(result.total);
    });

    it("should handle equal revenue split (50/50)", () => {
      const service = {
        ...mockService,
        revenueSharing: { ownerPercentage: 50, employeePercentage: 50 },
      };
      const result = computeServicePricing(service, 10000);

      expect(result.ownerRevenue).toBe(45000);
      expect(result.employeeRevenue).toBe(45000);
    });

    it("should handle uneven splits (70/30)", () => {
      const service = {
        ...mockService,
        revenueSharing: { ownerPercentage: 70, employeePercentage: 30 },
      };
      const result = computeServicePricing(service, 0);

      expect(result.ownerRevenue).toBe(70000);
      expect(result.employeeRevenue).toBe(30000);
    });
  });

  // §5.14, confirmed 2026-11-08: used only when >1 category is filled on a
  // transaction. Each category's revenue split comes from its own GROSS
  // price (never a blended percentage across categories), and
  // discountAmount is subtracted only once at the very end — deliberately
  // NOT redistributed back into ownerRevenue/employeeRevenue. This means
  // ownerRevenue + employeeRevenue == subtotal here, not == total, the
  // moment a discount is applied — the opposite of computeServicePricing's
  // own invariant above, and that difference is the point of this suite.
  describe("computeMultiCategoryPricing", () => {
    const haircut = {
      name: "Haircut",
      price: 50000,
      revenueSharing: { ownerPercentage: 50, employeePercentage: 50 },
    };
    const colouring = {
      name: "Colouring",
      price: 150000,
      revenueSharing: { ownerPercentage: 60, employeePercentage: 40 },
    };

    it("sums subtotal across categories with no discount", () => {
      const result = computeMultiCategoryPricing([haircut, colouring], 0);

      expect(result.subtotal).toBe(200000);
      expect(result.total).toBe(200000);
    });

    it("computes each category's revenue split from its own gross price, independently", () => {
      const result = computeMultiCategoryPricing([haircut, colouring], 0);

      // haircut: 50% of 50,000 = 25,000. colouring: 60% of 150,000 = 90,000.
      expect(result.ownerRevenue).toBe(25000 + 90000);
      // haircut: 50,000 - 25,000 = 25,000. colouring: 150,000 - 90,000 = 60,000.
      expect(result.employeeRevenue).toBe(25000 + 60000);
    });

    it("subtracts discountAmount only from the final total, never from ownerRevenue/employeeRevenue", () => {
      const result = computeMultiCategoryPricing([haircut, colouring], 50000);

      expect(result.subtotal).toBe(200000);
      expect(result.total).toBe(150000);
      // Same gross split as the no-discount case above — the discount
      // never touches these two numbers.
      expect(result.ownerRevenue).toBe(25000 + 90000);
      expect(result.employeeRevenue).toBe(25000 + 60000);
    });

    it("deliberately does NOT keep ownerRevenue + employeeRevenue equal to total once a discount is applied", () => {
      const result = computeMultiCategoryPricing([haircut, colouring], 50000);

      expect(result.ownerRevenue + result.employeeRevenue).toBe(
        result.subtotal,
      );
      expect(result.ownerRevenue + result.employeeRevenue).not.toBe(
        result.total,
      );
    });

    it("still sums ownerRevenue + employeeRevenue to total when there is no discount", () => {
      const result = computeMultiCategoryPricing([haircut, colouring], 0);
      expect(result.ownerRevenue + result.employeeRevenue).toBe(result.total);
    });

    it("handles three or more categories", () => {
      const treatment = {
        name: "Treatment",
        price: 75000,
        revenueSharing: { ownerPercentage: 50, employeePercentage: 50 },
      };
      const result = computeMultiCategoryPricing(
        [haircut, colouring, treatment],
        0,
      );

      expect(result.subtotal).toBe(50000 + 150000 + 75000);
    });

    it("throws when discountAmount exceeds the combined subtotal", () => {
      expect(() =>
        computeMultiCategoryPricing([haircut, colouring], 999999),
      ).toThrow(/Discount cannot exceed/);
    });
  });

  describe("computeLoyaltyPoints", () => {
    it("converts 1,000 IDR to 1 point", () => {
      expect(computeLoyaltyPoints(1000)).toBe(1);
    });

    it("matches the user's own example: 25,000 IDR = 25 points", () => {
      expect(computeLoyaltyPoints(25000)).toBe(25);
    });

    it("floors a non-multiple of 1,000 instead of rounding", () => {
      expect(computeLoyaltyPoints(25700)).toBe(25);
      expect(computeLoyaltyPoints(25999)).toBe(25);
    });

    it("returns 0 for a total under 1,000", () => {
      expect(computeLoyaltyPoints(999)).toBe(0);
    });

    it("returns 0 for a total of 0 (e.g. a 100% discount)", () => {
      expect(computeLoyaltyPoints(0)).toBe(0);
    });
  });

  describe("extractRefId", () => {
    it("should extract id from raw ObjectId", () => {
      const objectId = new ObjectId();
      const result = extractRefId(objectId);
      expect(result).toBe(objectId.toString());
    });

    it("should extract id from populated object with _id", () => {
      const mockObj = { _id: new ObjectId(), name: "Test" };
      const result = extractRefId(mockObj);
      expect(result).toBe(mockObj._id.toString());
    });

    it("should extract id from populated object with toString method", () => {
      const mockObj = {
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        name: "Test",
      };
      const result = extractRefId(mockObj);
      expect(result).toBe("507f1f77bcf86cd799439011");
    });

    it("should handle string input (already extracted)", () => {
      const idString = "507f1f77bcf86cd799439011";
      const result = extractRefId(idString);
      expect(result).toBe(idString);
    });

    it("should return empty string for null/undefined", () => {
      expect(extractRefId(null)).toBe("");
      expect(extractRefId(undefined)).toBe("");
    });

    it("should handle object without _id", () => {
      const result = extractRefId({ name: "NoId" });
      expect(result).toBe("");
    });
  });
});
