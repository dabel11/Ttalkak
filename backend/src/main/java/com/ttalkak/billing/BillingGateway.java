package com.ttalkak.billing;

interface BillingGateway {
    record Payment(String paymentKey, String orderId, String status, String type, long totalAmount) {}
    String issueBillingKey(String authKey, String customerKey);
    Payment charge(String billingKey, String customerKey, String orderId, int amount);
    Payment lookup(String orderId);
}
