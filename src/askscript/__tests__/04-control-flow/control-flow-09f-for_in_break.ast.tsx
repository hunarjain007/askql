export = (
  <ask args={<list />}>
    <const
      name="itemPrices"
      type={<ref name="any" />}
      value={
        <struct>
          {"a"}
          {10}
          {"b"}
          {40}
          {"c"}
          {32}
          {"d"}
          {99}
        </struct>
      }
    />
    <let name="mySum" type={<ref name="float" />} value={0} />
    <forIn
      key={<let name="index" type={<ref name="any" />} />}
      in={<ref name="itemPrices" />}
    >
      <if
        condition={
          <call
            name="=="
            args={
              <list>
                <ref name="index" />
                {"c"}
              </list>
            }
            isOperator={true}
          />
        }
        elseBlock={false}
      >
        <break />
      </if>
      <assign
        name="mySum"
        value={
          <call
            name="plus"
            args={
              <list>
                <ref name="mySum" />
                <call
                  name="at"
                  args={
                    <list>
                      <ref name="itemPrices" />
                      <ref name="index" />
                    </list>
                  }
                />
              </list>
            }
          />
        }
      />
    </forIn>
    <ref name="mySum" />
  </ask>
);
