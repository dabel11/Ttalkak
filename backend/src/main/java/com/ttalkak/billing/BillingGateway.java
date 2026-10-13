package com.ttalkak.billing;

interface BillingGateway {
    default <T> T withinRequestBudget(java.util.function.Supplier<T> operation) {
        return operation.get();
    }
    record Payment(String paymentKey, String orderId, String status, String type, long totalAmount,
                   Long balanceAmount) {
        Payment(String paymentKey, String orderId, String status, String type, long totalAmount) {
            this(paymentKey, orderId, status, type, totalAmount, totalAmount);
        }
    }
    String issueBillingKey(String authKey, String customerKey);
    Payment charge(String billingKey, String customerKey, String orderId, int amount, String orderName);
    Payment lookup(String orderId);
    Payment cancel(String paymentKey, String refundKey, int amount);
}
