package com.ttalkak.subscription;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Optional;

@Configuration
public class BillingConfiguration {
    @Bean
    @ConditionalOnMissingBean(BillingGateway.class)
    BillingGateway unavailableBillingGateway() {
        return new BillingGateway() {
            @Override
            public Optional<java.net.URI> createCheckout(Long memberId, String plan) {
                return Optional.empty();
            }

            @Override
            public Optional<java.net.URI> createPortal(Long memberId) {
                return Optional.empty();
            }
        };
    }
}
