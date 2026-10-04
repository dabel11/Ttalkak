package com.ttalkak.billing;

interface BillingGateway {
    default <T> T withinRequestBudget(java.util.function.Supplier<T> operation) {
        return operation.get();
    }
    record Payment(String paymentKey, String orderId, String status, String type, long totalAmount) {}
    String issueBillingKey(String authKey, String customerKey);
    Payment charge(String billingKey, String customerKey, String orderId, int amount);
    Payment lookup(String orderId);
}
