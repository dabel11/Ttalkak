package com.ttalkak.subscription;

import java.net.URI;
import java.util.Optional;

public interface BillingGateway {
    Optional<URI> createCheckout(Long memberId, String plan);
    Optional<URI> createPortal(Long memberId);
}
