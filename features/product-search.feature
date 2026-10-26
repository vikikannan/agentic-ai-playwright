Feature: Product search

  Scenario: Search for an existing product
    Given the visitor is on the products page
    When the visitor searches for "Blue Top"
    Then the search results should be displayed
    And the results should contain "Blue Top"
    And the product price should be "Rs. 500"
